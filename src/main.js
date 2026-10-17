import { oxapayWebhookHandler } from './lib/depositApproval.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { initCron } from './cron.js';

dotenv.config();

// Initialize automated tasks
initCron();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Main API Router
// OxaPay Webhook multi-path aliases for guaranteed delivery
app.post('/oxapay-webhook', oxapayWebhookHandler);
app.post('/users/oxapay-webhook', oxapayWebhookHandler);
app.post('/api/oxapay-webhook', oxapayWebhookHandler);

app.use('/api', apiRoutes);
app.use('/', apiRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'TradeFluxBot Backend is running!', version: '2.1.0' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Triggering restart


// Ensure default admin credentials exist and match on server start
async function ensureAdmin() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const bcrypt = (await import('bcryptjs')).default;
    const prisma = new PrismaClient();
    const adminEmail = 'admin@tradefluxbot.com';
    const adminPassword = 'Chinedu2$';
    const hash = await bcrypt.hash(adminPassword, 10);
    
    await prisma.admins.upsert({
      where: { email: adminEmail },
      update: { password_hash: hash },
      create: {
        email: adminEmail,
        password_hash: hash,
        role: 'superadmin'
      }
    });
    console.log(`[BOOT] Admin account verified (${adminEmail})`);
  } catch (err) {
    console.error('[BOOT] Error verifying admin credentials:', err.message);
  }
}
ensureAdmin();

// Automatically convert all plans and active investments to flexible on boot
async function makeAllPlansFlexible() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    // 1. Update all plans to flexible
    const updatedPlans = await prisma.plans.updateMany({
      where: { is_fixed_deposit: true },
      data: { is_fixed_deposit: false }
    });
    if (updatedPlans.count > 0) {
      console.log(`[BOOT] Converted ${updatedPlans.count} plans to Flexible`);
    }

    // 2. Unlock ALL past accumulated profits for active investments that were fixed
    const activeInvestments = await prisma.investments.findMany({
      where: {
        status: { in: ['ACTIVE', 'active'] }
      },
      include: { plan: true }
    });

    for (const inv of activeInvestments) {
      const totalAccumulated = parseFloat(inv.total_paid || 0);

      // Check how much profit was already paid out to wallet for this investment
      const paidTxs = await prisma.transactions.findMany({
        where: {
          user_id: inv.user_id,
          reference_id: inv.id,
          type: 'profit'
        }
      });
      const alreadyPaid = paidTxs.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);

      // Amount that was earned in the past while fixed and hasn't dropped to wallet yet
      const unpaidProfit = Math.max(0, totalAccumulated - alreadyPaid);

      if (unpaidProfit > 0) {
        const user = await prisma.users.findUnique({ where: { id: inv.user_id } });
        if (user) {
          const currentBal = parseFloat(user.withdrawable_balance || 0);
          const newBal = currentBal + unpaidProfit;

          // Credit the past earnings to user's withdrawable balance immediately
          await prisma.users.update({
            where: { id: inv.user_id },
            data: { withdrawable_balance: newBal }
          });

          // Record transaction so user sees their past earnings have dropped into their wallet
          await prisma.transactions.create({
            data: {
              user_id: inv.user_id,
              type: 'profit',
              amount: unpaidProfit,
              balance_before: currentBal,
              balance_after: newBal,
              description: `Accumulated earnings credited for ${inv.plan.name} (Converted to Flexible)`,
              reference_id: inv.id
            }
          });

          // Clean up old 'locked_profit' placeholder transactions so user history is clean
          await prisma.transactions.deleteMany({
            where: {
              user_id: inv.user_id,
              reference_id: inv.id,
              type: 'locked_profit'
            }
          });

          console.log(`[BOOT] Successfully unlocked ${unpaidProfit.toFixed(2)} past earnings for user ${user.email} on ${inv.plan.name}`);
        }
      }
    }
  } catch (err) {
    console.error('[BOOT] Error making plans flexible:', err.message);
  }
}
// makeAllPlansFlexible(); // Disabled: All plans already flexible, prevents double credit on boot
