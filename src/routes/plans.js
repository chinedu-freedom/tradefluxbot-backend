import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

import { authenticate } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';

const router = Router();
const prisma = new PrismaClient();

// Get active plans
router.get('/', async (req, res) => {
  try {
    const plans = await prisma.plans.findMany({
      where: {
        status: true
      },
      orderBy: {
        created_at: 'asc'
      }
    });
    
    res.json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch plans' });
  }
});

// Invest in a plan
router.post('/invest', authenticate, async (req, res) => {
  try {
    const { planId, amount, source } = req.body;
    const userId = req.user.id;

    if (!planId || !amount || !source) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (source !== 'main' && source !== 'gift') {
      return res.status(400).json({ success: false, error: 'Invalid balance source' });
    }

    const plan = await prisma.plans.findUnique({ where: { id: planId } });
    if (!plan || !plan.status) {
      return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
    }

    const investAmount = Number(amount);
    if (isNaN(investAmount) || investAmount < Number(plan.min_investment) || investAmount > Number(plan.max_investment)) {
      return res.status(400).json({ success: false, error: `Investment must be between ${plan.min_investment} and ${plan.max_investment}` });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const currentBalance = Number(user.balance);
    const currentWithdrawable = Number(user.withdrawable_balance || 0);
    const totalBalance = Math.round((currentBalance + currentWithdrawable) * 100) / 100;
    if (totalBalance < investAmount) {
      return res.status(400).json({ success: false, error: 'Insufficient Balance. Please fund your account and try again.' });
    }

    const dailyProfit = investAmount * (Number(plan.daily_income) / 100);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.duration);

    await prisma.$transaction(async (tx) => {
      // Deduct balance
      let updateData = {};
      
      if (currentBalance >= investAmount) {
        updateData = { balance: currentBalance - investAmount };
      } else {
        updateData = { 
          balance: 0,
          withdrawable_balance: Math.max(0, currentWithdrawable - (investAmount - currentBalance))
        };
      }

      await tx.users.update({
        where: { id: userId },
        data: updateData
      });

      // Create investment
      await tx.investments.create({
        data: {
          user_id: userId,
          plan_id: planId,
          amount: investAmount,
          daily_profit: dailyProfit,
          status: 'ACTIVE',
          start_date: startDate,
          end_date: endDate
        }
      });

      // Add transaction record
      const balanceBefore = currentBalance + currentWithdrawable;
      const balanceAfter = balanceBefore - investAmount;
      
      await tx.transactions.create({
        data: {
          user_id: userId,
          type: 'INVESTMENT',
          amount: investAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Investment in ${plan.name}`
        }
      });
      
      // Distribute referral commissions (up to 3 levels)
      const settings = await tx.settings.findFirst();
      if (settings) {
        let currentUser = user;
        const levels = [
          { rate: Number(settings.level1_commission || 0) },
          { rate: Number(settings.level2_commission || 0) },
          { rate: Number(settings.level3_commission || 0) },
          { rate: Number(settings.level4_commission || 0) }
        ];

        for (let i = 0; i < 4; i++) {
          if (!currentUser.referred_by || levels[i].rate <= 0) break;
          
          const referrerId = currentUser.referred_by;
          const referrer = await tx.users.findUnique({ where: { id: referrerId } });
          
          if (!referrer) break;
          
          const commissionAmount = investAmount * (levels[i].rate / 100);
          const newReferrerBalance = Number(referrer.withdrawable_balance || 0) + commissionAmount;
          
          await tx.users.update({
            where: { id: referrerId },
            data: { withdrawable_balance: newReferrerBalance }
          });
          
          await tx.referral_commissions.create({
            data: {
              user_id: referrerId,
              from_user_id: userId,
              amount: commissionAmount,
              level: i + 1
            }
          });
          
          await tx.transactions.create({
            data: {
              user_id: referrerId,
              type: 'REFERRAL_COMMISSION',
              amount: commissionAmount,
              balance_before: Number(referrer.withdrawable_balance || 0),
              balance_after: newReferrerBalance,
              description: `Level ${i + 1} referral commission from ${user.username || user.full_name}`
            }
          });
          
          currentUser = referrer;
        }
      }
    });

    await logActivity(userId, 'package purchase', req, { planName: plan.name, amount: investAmount });

    res.json({ success: true, message: 'Mining Pool Successfully Activated 🎉' });
  } catch (error) {
    console.error('Investment error:', error);
    res.status(500).json({ success: false, error: 'Failed to process investment' });
  }
});

export default router;
