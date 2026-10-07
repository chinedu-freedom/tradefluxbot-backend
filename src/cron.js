import { syncPendingOxaPayDeposits } from './lib/depositApproval.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const runInvestmentCron = async () => {
  try {
    // Get all active investments
    const activeInvestments = await prisma.investments.findMany({
      where: {
        status: {
          in: ['Active', 'ACTIVE', 'active']
        }
      },
      include: {
        plan: true,
        user: true,
        profits: {
          orderBy: { paid_date: 'desc' },
          take: 1
        }
      }
    });

    for (const inv of activeInvestments) {
      const now = new Date();
      
      // Determine when the last payout was
      let lastPayoutDate = new Date(inv.start_date);
      if (inv.profits && inv.profits.length > 0) {
        lastPayoutDate = new Date(inv.profits[0].paid_date);
      }

      // If 24 hours have passed since last payout
      const timeSinceLastPayout = now.getTime() - lastPayoutDate.getTime();
      const hoursSinceLastPayout = timeSinceLastPayout / (1000 * 60 * 60);

      // We give profit every 24 hours
      if (hoursSinceLastPayout >= 24) {
        // Calculate days to pay (just in case cron missed a day or server was down)
        const daysToPay = Math.floor(hoursSinceLastPayout / 24);
        
        let shouldComplete = false;

        for (let i = 0; i < daysToPay; i++) {
          // Get current total_paid to track payout progress
          const currentTotalPaid = await prisma.investments.findUnique({ where: { id: inv.id }});
          const dailyIncomePercentage = parseFloat(inv.plan.daily_income);
          
          // Simple Interest Profit: Profit is based strictly on the initial investment amount
          const profitAmount = parseFloat(inv.amount) * (dailyIncomePercentage / 100);

          // Determine the exact paid_date for this missing payout
          const precisePaidDate = new Date(lastPayoutDate.getTime() + ((i + 1) * 24 * 60 * 60 * 1000));

          // Log the profit generation (used for tracking and history)
          await prisma.investment_profits.create({
            data: {
              investment_id: inv.id,
              user_id: inv.user_id,
              amount: profitAmount,
              paid_date: precisePaidDate
            }
          });

          // ONLY add to wallet balance if it's NOT a Fixed Deposit
          if (!inv.plan.is_fixed_deposit) {
            // Get fresh user withdrawable_balance
            const user = await prisma.users.findUnique({ where: { id: inv.user_id } });
            const newBalance = parseFloat(user.withdrawable_balance || 0) + profitAmount;

            // Add profit to withdrawable_balance
            await prisma.users.update({
              where: { id: inv.user_id },
              data: { withdrawable_balance: newBalance }
            });

            // Log the transaction
            await prisma.transactions.create({
              data: {
                user_id: inv.user_id,
                type: 'profit',
                amount: profitAmount,
                balance_before: parseFloat(user.withdrawable_balance || 0),
                balance_after: newBalance,
                description: `Daily profit payout for ${inv.plan.name}`,
                reference_id: inv.id
              }
            });
          }

          // Update investment paid amounts (compounding factor)
          const totalPaidStr = (parseFloat(currentTotalPaid.total_paid) + profitAmount).toFixed(8);

          await prisma.investments.update({
            where: { id: inv.id },
            data: {
              total_paid: totalPaidStr
            }
          });

          // Check if it reached end_date
          if (precisePaidDate >= new Date(inv.end_date)) {
            shouldComplete = true;
            break; // Stop paying for this investment
          }
        }

        if (shouldComplete) {
          // If it was a fixed deposit, now is the time to pay out all accumulated profits in one go
          if (inv.plan.is_fixed_deposit) {
            const finalInv = await prisma.investments.findUnique({ where: { id: inv.id } });
            const totalAccumulatedProfit = parseFloat(finalInv.total_paid);
            
            if (totalAccumulatedProfit > 0) {
              const user = await prisma.users.findUnique({ where: { id: inv.user_id } });
              const newBalance = parseFloat(user.withdrawable_balance || 0) + totalAccumulatedProfit;

              await prisma.users.update({
                where: { id: inv.user_id },
                data: { withdrawable_balance: newBalance }
              });

              await prisma.transactions.create({
                data: {
                  user_id: inv.user_id,
                  type: 'profit',
                  amount: totalAccumulatedProfit,
                  balance_before: parseFloat(user.withdrawable_balance || 0),
                  balance_after: newBalance,
                  description: `Fixed Deposit Maturity Profit for ${inv.plan.name}`,
                  reference_id: inv.id
                }
              });
            }
          }

          await prisma.investments.update({
            where: { id: inv.id },
            data: { status: 'COMPLETED' }
          });
          // Note: Capital return is completely disabled per user request. Capital vanishes.
        }
      } else if (now >= new Date(inv.end_date)) {
        // If it's already end date but no 24 hours have passed since last payout
        // Pay out fixed deposit if needed
        if (inv.plan.is_fixed_deposit) {
          const finalInv = await prisma.investments.findUnique({ where: { id: inv.id } });
          const totalAccumulatedProfit = parseFloat(finalInv.total_paid);
          
          if (totalAccumulatedProfit > 0) {
            const user = await prisma.users.findUnique({ where: { id: inv.user_id } });
            const newBalance = parseFloat(user.withdrawable_balance || 0) + totalAccumulatedProfit;

            await prisma.users.update({
              where: { id: inv.user_id },
              data: { withdrawable_balance: newBalance }
            });

            await prisma.transactions.create({
              data: {
                user_id: inv.user_id,
                type: 'profit',
                amount: totalAccumulatedProfit,
                balance_before: parseFloat(user.withdrawable_balance || 0),
                balance_after: newBalance,
                description: `Fixed Deposit Maturity Profit for ${inv.plan.name}`,
                reference_id: inv.id
              }
            });
          }
        }

        await prisma.investments.update({
           where: { id: inv.id },
           data: { status: 'COMPLETED' }
        });
        // Note: Capital return is completely disabled per user request. Capital vanishes.
      }
    }
  } catch (error) {
    console.error('Error in Investment Cron:', error);
  }
};

export const runExchangeRateCron = async () => {
  try {
    const autoUpdateCountries = await prisma.countries.findMany({
      where: { auto_update: true }
    });

    if (autoUpdateCountries.length === 0) return;

    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();

    if (data && data.rates) {
      for (const country of autoUpdateCountries) {
        const trimmedCode = country.currency_code.trim().toUpperCase();
        const liveRate = data.rates[trimmedCode];
        if (liveRate) {
          await prisma.countries.update({
            where: { id: country.id },
            data: { 
              exchange_rate: liveRate,
              currency_code: trimmedCode // Standardize the code in the database as well
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("Exchange Rate Cron Error:", err);
  }
};

// Start the cron to run periodically
export const initCron = () => {
  console.log('Automated Investment Profit & Exchange Rate Crons Initialized...');
  // Run immediately on start
  runInvestmentCron();
  runExchangeRateCron();
  
  // Then run every 5 minutes to check for due payouts
  setInterval(runInvestmentCron, 5 * 60 * 1000);
  
  // Run exchange rate update every 15 minutes
  setInterval(runExchangeRateCron, 15 * 60 * 1000);
};
