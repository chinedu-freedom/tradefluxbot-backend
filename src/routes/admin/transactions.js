import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { sendDepositNotificationEmail, sendWithdrawalNotificationEmail } from '../../lib/mailer.js';
import { logActivity } from '../../lib/logger.js';

const router = Router();
const prisma = new PrismaClient();

// Get all deposits
router.get('/deposits', async (req, res) => {
  try {
    const deposits = await prisma.deposits.findMany({
      include: { user: { select: { id: true, email: true, full_name: true, profile_image: true } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(deposits);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Approve/Reject deposit
router.put('/deposits/:id/status', async (req, res) => {
  const { status } = req.body; // 'APPROVED' or 'REJECTED'
  try {
    const deposit = await prisma.deposits.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    if (deposit.status !== 'PENDING') return res.status(400).json({ error: 'Deposit is already processed' });

    let updatedDeposit;

    if (status === 'APPROVED') {
      const newBalance = Number(deposit.user.balance) + Number(deposit.amount);
      
      const result = await prisma.$transaction([
        prisma.deposits.update({
          where: { id: deposit.id },
          data: { status: 'APPROVED', approved_by: req.user.id, approved_at: new Date() }
        }),
        prisma.users.update({
          where: { id: deposit.user_id },
          data: { balance: newBalance }
        }),
        prisma.transactions.create({
          data: {
            user_id: deposit.user_id,
            type: 'DEPOSIT',
            amount: deposit.amount,
            balance_before: deposit.user.balance,
            balance_after: newBalance,
            description: 'Deposit approved'
          }
        }),
        prisma.user_spins.upsert({
          where: { user_id: deposit.user_id },
          create: {
            user_id: deposit.user_id,
            free_spins_remaining: 1,
            total_spins_used: 0,
            total_rewards_earned: 0
          },
          update: {
            free_spins_remaining: { increment: 1 }
          }
        })
      ]);
      updatedDeposit = result[0];
      await logActivity(deposit.user_id, 'deposit completed', req, { amount: deposit.amount, cryptocurrency: deposit.cryptocurrency });
    } else if (status === 'REJECTED') {
      updatedDeposit = await prisma.deposits.update({
        where: { id: deposit.id },
        data: { status: 'REJECTED', approved_by: req.user.id, approved_at: new Date() }
      });
    }

    // Send email notification to user
    try {
      await sendDepositNotificationEmail({
        email: deposit.user.email,
        name: deposit.user.full_name || deposit.user.username || 'User',
        crypto: deposit.cryptocurrency,
        amount: Number(deposit.amount),
        status: status.toLowerCase(),
        date: new Date()
      });
    } catch (err) {
      console.error('Failed to send deposit status email:', err);
    }

    res.json(updatedDeposit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update deposit status', details: error.message });
  }
});

// Get all withdrawals
router.get('/withdrawals', async (req, res) => {
  try {
    const withdrawals = await prisma.withdrawals.findMany({
      include: { user: { select: { id: true, email: true, full_name: true, profile_image: true } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(withdrawals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Approve/Reject withdrawal
router.put('/withdrawals/:id/status', async (req, res) => {
  const { status } = req.body; // 'APPROVED', 'REJECTED', or 'PAID'
  try {
    const withdrawal = await prisma.withdrawals.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

    let updatedWithdrawal;

    if (status === 'REJECTED' && withdrawal.status === 'PENDING') {
      // Refund the user's withdrawable balance
      const newWithdrawable = Number(withdrawal.user.withdrawable_balance || 0) + Number(withdrawal.amount);
      
      const result = await prisma.$transaction([
        prisma.withdrawals.update({
          where: { id: withdrawal.id },
          data: { status: 'REJECTED', processed_by: req.user.id, processed_at: new Date() }
        }),
        prisma.users.update({
          where: { id: withdrawal.user_id },
          data: { withdrawable_balance: newWithdrawable }
        }),
        prisma.transactions.create({
          data: {
            user_id: withdrawal.user_id,
            type: 'ADJUSTMENT',
            amount: withdrawal.amount,
            balance_before: withdrawal.user.withdrawable_balance || 0,
            balance_after: newWithdrawable,
            description: 'Withdrawal rejected (Refund)'
          }
        })
      ]);
      updatedWithdrawal = result[0];
    } else {
      updatedWithdrawal = await prisma.withdrawals.update({
        where: { id: withdrawal.id },
        data: { status, processed_by: req.user.id, processed_at: new Date() }
      });
    }

    // Send email notification to user
    try {
      await sendWithdrawalNotificationEmail({
        email: withdrawal.user.email,
        name: withdrawal.user.full_name || withdrawal.user.username || 'User',
        crypto: withdrawal.withdrawal_method,
        amount: Number(withdrawal.amount),
        walletAddress: withdrawal.wallet_address,
        status: status.toLowerCase(),
        date: new Date()
      });
    } catch (err) {
      console.error('Failed to send withdrawal status email:', err);
    }

    res.json(updatedWithdrawal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update withdrawal status' });
  }
});

// Get all investments (purchases)
router.get('/investments', async (req, res) => {
  try {
    const investments = await prisma.investments.findMany({
      include: { 
        user: { select: { email: true, full_name: true } },
        plan: { select: { name: true, image: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(investments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

export default router;
