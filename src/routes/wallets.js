import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { authenticate } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';
import { sendWalletLinkOtpEmail } from '../lib/mailer.js';
import { generateSecurityOtp, verifySecurityOtp } from '../lib/otpService.js';

const router = Router();
const prisma = new PrismaClient();

// Get all linked wallets of the user
router.get('/', authenticate, async (req, res) => {
  try {
    const wallets = await prisma.user_wallets.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' }
    });
    res.json({ success: true, wallets });
  } catch (error) {
    console.error('Error fetching linked wallets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch linked wallets' });
  }
});

// Send OTP to user email before linking wallet
router.post('/send-otp', authenticate, async (req, res) => {
  try {
    const { symbol, network, address } = req.body;
    const userId = req.user.id;

    if (!symbol || !network || !address || !address.trim()) {
      return res.status(400).json({ success: false, error: 'Symbol, network, and address are required' });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.withdrawal_pin) {
      return res.status(400).json({ success: false, error: 'Please set your withdrawal password in settings before linking a wallet.' });
    }

    const otpResult = generateSecurityOtp(userId, 'WALLET_LINK', {
      symbol,
      network,
      address: address.trim()
    });

    if (!otpResult.success) {
      return res.status(429).json({
        success: false,
        error: otpResult.message,
        remainingSeconds: otpResult.remainingSeconds
      });
    }

    const emailRes = await sendWalletLinkOtpEmail({
      email: user.email,
      name: user.full_name || user.username || 'User',
      symbol,
      network,
      address: address.trim(),
      code: otpResult.code
    });

    if (!emailRes?.success) {
      return res.status(500).json({ success: false, error: 'Failed to deliver verification code to your email. Please try again.' });
    }

    res.json({ success: true, message: `Verification code sent to ${user.email}` });
  } catch (error) {
    console.error('Send wallet link OTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to send verification code' });
  }
});

// Link/Update a wallet address (Requires Email OTP + Withdrawal Password)
router.post('/', authenticate, async (req, res) => {
  try {
    const { symbol, network, address, label, withdrawalPassword, otp } = req.body;
    const userId = req.user.id;

    if (!symbol || !network || !address || !withdrawalPassword || !otp) {
      return res.status(400).json({ success: false, error: 'Missing required fields: symbol, network, address, withdrawalPassword, otp' });
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      return res.status(400).json({ success: false, error: 'Address cannot be empty' });
    }

    // Verify 2-Step Email OTP Code
    const otpCheck = verifySecurityOtp(userId, 'WALLET_LINK', otp, true);
    if (!otpCheck.valid) {
      return res.status(400).json({ success: false, error: otpCheck.message });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!user.withdrawal_pin) {
      return res.status(400).json({ success: false, error: 'Please set your withdrawal password in settings before linking a wallet.' });
    }

    // Verify withdrawal password
    const isPinValid = await bcrypt.compare(withdrawalPassword, user.withdrawal_pin);
    if (!isPinValid) {
      return res.status(400).json({ success: false, error: 'Incorrect withdrawal password' });
    }


    // Upsert linked wallet address (unique constraint on user_id, symbol, network)
    const wallet = await prisma.user_wallets.upsert({
      where: {
        user_id_symbol_network: {
          user_id: userId,
          symbol,
          network
        }
      },
      update: {
        address: trimmedAddress,
        label: label || null
      },
      create: {
        user_id: userId,
        symbol,
        network,
        address: trimmedAddress,
        label: label || null
      }
    });

    await logActivity(userId, 'wallet linked', req, { symbol, network, label });

    res.json({ success: true, message: 'Wallet address successfully linked!', wallet });
  } catch (error) {
    console.error('Error linking wallet address:', error);
    res.status(500).json({ success: false, error: 'Failed to link wallet address' });
  }
});

// Delete a linked wallet address
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const wallet = await prisma.user_wallets.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    if (wallet.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.user_wallets.delete({ where: { id } });

    await logActivity(userId, 'wallet unlinked', req, { symbol: wallet.symbol, network: wallet.network });

    res.json({ success: true, message: 'Wallet address successfully unlinked!' });
  } catch (error) {
    console.error('Error deleting linked wallet:', error);
    res.status(500).json({ success: false, error: 'Failed to delete linked wallet' });
  }
});

export default router;
