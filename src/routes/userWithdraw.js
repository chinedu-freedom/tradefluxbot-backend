import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import { sendWithdrawalNotificationEmail, sendWithdrawalOtpEmail } from '../lib/mailer.js';
import { generateSecurityOtp, verifySecurityOtp } from '../lib/otpService.js';
import { logActivity } from '../lib/logger.js';

const router = Router();
const prisma = new PrismaClient();

// Send Withdrawal Email Verification OTP
router.post('/withdraw/send-otp', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, network, wallet_address } = req.body;

    if (!amount || !network || !wallet_address) {
      return res.status(400).json({ success: false, message: 'Amount, network, and wallet address are required' });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.withdrawal_pin) {
      return res.status(400).json({ success: false, message: 'Please set your withdrawal password in settings first' });
    }

    const settings = await prisma.settings.findFirst();
    const minAmount = Number(settings?.min_withdrawal || 5);
    const maxAmount = Number(settings?.max_withdrawal || 1000000);
    const symbol = settings?.currency_symbol || '$';

    if (Number(amount) < minAmount) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ${symbol}${minAmount}` });
    }

    if (Number(amount) > maxAmount) {
      return res.status(400).json({ success: false, message: `Maximum withdrawal amount is ${symbol}${maxAmount}` });
    }

    const withdrawableBal = Number(user.withdrawable_balance || 0);
    if (withdrawableBal < Number(amount)) {
      return res.status(400).json({ success: false, message: 'Insufficient withdrawable balance' });
    }

    const otpResult = generateSecurityOtp(userId, 'WITHDRAWAL', {
      amount: Number(amount),
      network,
      wallet_address: String(wallet_address).trim()
    });

    if (!otpResult.success) {
      return res.status(429).json({
        success: false,
        message: otpResult.message,
        remainingSeconds: otpResult.remainingSeconds
      });
    }

    const emailRes = await sendWithdrawalOtpEmail({
      email: user.email,
      name: user.full_name || user.username || 'User',
      amount: Number(amount),
      currencySymbol: symbol,
      network,
      address: String(wallet_address).trim(),
      code: otpResult.code
    });

    if (!emailRes?.success) {
      return res.status(500).json({ success: false, message: 'Failed to deliver verification code to your email. Please try again.' });
    }

    res.json({ success: true, message: `Verification code sent to ${user.email}` });
  } catch (error) {
    console.error('Send withdrawal OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send withdrawal verification code' });
  }
});

// Process Withdrawal Request
router.post('/withdraw', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, network, wallet_address, password, otp, method } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid withdrawal amount is required' });
    }

    if (!wallet_address || !String(wallet_address).trim()) {
      return res.status(400).json({ success: false, message: 'Wallet address is required' });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'Withdrawal password is required' });
    }

    // If OTP was provided, verify it
    if (otp) {
      const otpCheck = verifySecurityOtp(userId, 'WITHDRAWAL', otp, true);
      if (!otpCheck.valid) {
        return res.status(400).json({ success: false, message: otpCheck.message });
      }
    }

    // Fetch global settings
    const settings = await prisma.settings.findFirst();
    const minAmount = Number(settings?.min_withdrawal || 5);
    const maxAmount = Number(settings?.max_withdrawal || 1000000);
    const feeRate = Number(settings?.withdrawal_charge !== undefined ? settings.withdrawal_charge : 5) / 100;
    const symbol = settings?.currency_symbol || '$';

    const numAmount = Number(amount);

    if (numAmount < minAmount) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal amount is ${symbol}${minAmount}` });
    }

    if (numAmount > maxAmount) {
      return res.status(400).json({ success: false, message: `Maximum withdrawal amount is ${symbol}${maxAmount}` });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.can_withdraw === false) {
      return res.status(403).json({ success: false, message: 'Withdrawals are currently disabled for your account' });
    }

    // Verify withdrawal password (check withdrawal_pin or fallback to password_hash)
    let isPasswordValid = false;
    if (user.withdrawal_pin) {
      isPasswordValid = await bcrypt.compare(password, user.withdrawal_pin);
    }
    if (!isPasswordValid && user.password_hash) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    }

    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Incorrect withdrawal password' });
    }

    const withdrawableBal = Number(user.withdrawable_balance || 0);

    if (withdrawableBal < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient withdrawable balance' });
    }

    const fees = Number((numAmount * feeRate).toFixed(2));
    const netAmount = Number((numAmount - fees).toFixed(2));
    const methodStr = method === 'crypto' || !method ? (network || 'Crypto') : method;

    let withdrawalResult;

    await prisma.$transaction(async (tx) => {
      // 1. Deduct from user's withdrawable balance
      await tx.users.update({
        where: { id: userId },
        data: {
          withdrawable_balance: { decrement: numAmount }
        }
      });

      // 2. Create withdrawal record
      withdrawalResult = await tx.withdrawals.create({
        data: {
          user_id: userId,
          amount: numAmount,
          withdrawal_method: methodStr,
          fees: fees,
          net_amount: netAmount,
          wallet_address: String(wallet_address).trim(),
          status: 'PENDING'
        }
      });

      // 3. Create transaction record
      await tx.transactions.create({
        data: {
          user_id: userId,
          type: 'WITHDRAWAL',
          amount: numAmount,
          balance_before: withdrawableBal,
          balance_after: withdrawableBal - numAmount,
          reference_id: withdrawalResult.id,
          description: `Withdrawal request via ${methodStr}`
        }
      });
    });

    // Send withdrawal notification emails
    try {
      await sendWithdrawalNotificationEmail({
        email: user.email,
        name: user.full_name || user.username || 'User',
        crypto: methodStr,
        amount: numAmount,
        walletAddress: String(wallet_address).trim(),
        status: 'pending',
        date: new Date()
      });

      const adminEmail = process.env.ZOHO_FROM_EMAIL;
      if (adminEmail) {
        await sendWithdrawalNotificationEmail({
          email: adminEmail,
          name: 'Admin',
          crypto: methodStr,
          amount: numAmount,
          walletAddress: String(wallet_address).trim(),
          status: 'pending',
          date: new Date(),
          isAdmin: true,
          userName: user.full_name || user.username || 'User',
          userEmail: user.email
        });
      }
    } catch (err) {
      console.error('Failed to send withdrawal notification email:', err);
    }

    await logActivity(userId, 'withdrawal requested', req, {
      amount: numAmount,
      fees,
      net_amount: netAmount,
      destination: String(wallet_address).trim(),
      method: methodStr
    });

    return res.json({
      success: true,
      message: 'Withdrawal request submitted successfully. Awaiting approval.',
      withdrawal: withdrawalResult
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to process withdrawal request' });
  }
});

export default router;
