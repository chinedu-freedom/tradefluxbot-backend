import { PrismaClient } from '@prisma/client';
import { distributeDepositReferralCommission } from './referral.js';
import { sendDepositNotificationEmail } from './mailer.js';
import { logActivity } from './logger.js';

const prisma = new PrismaClient();

export async function processApprovedDeposit(deposit, { paidAmount, txID, currency, req = null }) {
  try {
    const currentDep = await prisma.deposits.findUnique({
      where: { id: deposit.id },
      include: { user: true }
    });

    if (!currentDep || currentDep.status === 'APPROVED') {
      return { success: true, alreadyProcessed: true };
    }

    const creditAmount = Number(currentDep.amount);

    await prisma.$transaction(async (tx) => {
      await tx.deposits.update({
        where: { id: currentDep.id },
        data: {
          status: 'APPROVED',
          amount: creditAmount,
          approved_at: new Date(),
          tx_hash: txID || currentDep.tx_hash
        }
      });

      const user = await tx.users.findUnique({ where: { id: currentDep.user_id } });
      const balanceBefore = Number(user.balance);
      const balanceAfter = balanceBefore + creditAmount;

      await tx.users.update({
        where: { id: currentDep.user_id },
        data: { balance: balanceAfter }
      });

      await tx.transactions.create({
        data: {
          user_id: currentDep.user_id,
          type: 'DEPOSIT',
          amount: creditAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference_id: currentDep.id,
          description: `Deposit of ${creditAmount} (${currentDep.cryptocurrency || currency || 'Crypto'})`
        }
      });

      await tx.user_spins.upsert({
        where: { user_id: currentDep.user_id },
        create: {
          user_id: currentDep.user_id,
          free_spins_remaining: 1,
          total_spins_used: 0,
          total_rewards_earned: 0
        },
        update: {
          free_spins_remaining: { increment: 1 }
        }
      });

      // 5% direct referral commission to referrer on deposit
      await distributeDepositReferralCommission(tx, {
        userId: currentDep.user_id,
        depositAmount: creditAmount
      });
    });

    // Send success email to user
    try {
      const user = await prisma.users.findUnique({ where: { id: currentDep.user_id } });
      if (user) {
        await sendDepositNotificationEmail({
          email: user.email,
          name: user.full_name || user.username || 'User',
          crypto: currentDep.cryptocurrency || currency,
          amount: creditAmount,
          status: 'approved',
          date: new Date()
        });
      }
    } catch (err) {
      console.error("Failed to send deposit success email:", err);
    }

    if (req) {
      await logActivity(currentDep.user_id, 'deposit completed', req, { amount: creditAmount });
    }

    console.log(`[DEPOSIT_SUCCESS] Credited $${creditAmount} to user ${currentDep.user_id} (TrackID: ${currentDep.track_id})`);
    return { success: true, credited: creditAmount };
  } catch (error) {
    console.error('Error in processApprovedDeposit:', error);
    return { success: false, error: error.message };
  }
}

export async function oxapayWebhookHandler(req, res) {
  try {
    const payload = req.body || {};
    const trackId = payload.trackId ? String(payload.trackId) : "";
    const rawStatus = String(payload?.status || '').toLowerCase();

    console.log("OXAPAY_WEBHOOK_RECEIVED:", JSON.stringify(payload));

    if (rawStatus === '3' || rawStatus === 'expired') {
      return res.status(200).json({ ok: true });
    }

    if (rawStatus === '1' || rawStatus === 'confirming' || rawStatus === 'waiting') {
      if (trackId) {
        const initiatedDeposit = await prisma.deposits.findFirst({
          where: { track_id: trackId, status: 'initiated' }
        });
        if (initiatedDeposit) {
          await prisma.deposits.update({
            where: { id: initiatedDeposit.id },
            data: { status: 'PENDING' }
          });
        }
      }
      return res.status(200).json({ ok: true });
    }

    if (rawStatus === '2' || rawStatus === 'paid') {
      const paidAmount = Number(payload.amount) || 0;
      let deposit = null;
      if (trackId) {
        deposit = await prisma.deposits.findFirst({
          where: { track_id: trackId, status: { in: ['PENDING', 'initiated'] } }
        });
      }
      if (!deposit) {
        deposit = await prisma.deposits.findFirst({
          where: { amount: paidAmount, status: { in: ['PENDING', 'initiated'] } }
        });
      }

      if (!deposit) {
        return res.status(200).json({ ok: true });
      }

      await processApprovedDeposit(deposit, {
        paidAmount,
        txID: payload.txID,
        currency: payload.currency,
        req
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('OXAPAY_WEBHOOK_ERROR:', error);
    return res.status(200).json({ ok: true });
  }
}

export async function syncPendingOxaPayDeposits() {
  const OXAPAY_MERCHANT_KEY = process.env.OXAPAY_MERCHANT_KEY;
  if (!OXAPAY_MERCHANT_KEY) return;

  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pendingDeposits = await prisma.deposits.findMany({
      where: {
        track_id: { not: null },
        status: { in: ['initiated', 'PENDING'] },
        created_at: { gte: twoDaysAgo }
      }
    });

    if (pendingDeposits.length === 0) return;

    for (const dep of pendingDeposits) {
      try {
        const res = await fetch("https://api.oxapay.com/merchants/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchant: OXAPAY_MERCHANT_KEY,
            trackId: dep.track_id
          })
        });
        const data = await res.json();
        if (data.result === 100 && String(data.status).toLowerCase() === 'paid') {
          console.log(`[OXAPAY_SYNC] Found paid deposit via inquiry: TrackID ${dep.track_id}, Amount: ${data.amount}`);
          await processApprovedDeposit(dep, {
            paidAmount: Number(data.amount || dep.amount),
            txID: data.txID,
            currency: data.payCurrency || 'USDT'
          });
        } else if (data.result === 100 && String(data.status).toLowerCase() === 'expired') {
          await prisma.deposits.update({
            where: { id: dep.id },
            data: { status: 'EXPIRED' }
          });
        }
      } catch (err) {
        console.error(`Error checking trackId ${dep.track_id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Error in syncPendingOxaPayDeposits:', error);
  }
}
