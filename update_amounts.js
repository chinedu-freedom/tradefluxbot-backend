import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Updating Investment Amounts to $203 and $303 ---');

  // 1. Fetch Users
  const rich = await prisma.users.findUnique({ where: { email: 'madelasbongile701@gmail.com' } });
  const ziggy = await prisma.users.findUnique({ where: { email: 'roytheovic@gmail.com' } });
  const nelz = await prisma.users.findUnique({ where: { email: 'tebnelz@gmail.com' } });

  if (!ziggy || !nelz || !rich) {
    console.error('One or more users not found! Rich:', !!rich, 'Ziggy:', !!ziggy, 'Nelz:', !!nelz);
    return;
  }

  // ==========================================
  // 2. MOTLABASEO NTSEME (Ziggyteb): $203.00
  // ==========================================
  const ziggyAmount = 203.00;
  const ziggyDailyProfit = 10.15; // 5% of 203
  const ziggy7DaysProfit = 71.05; // 7 * 10.15 = 71.05
  const ziggyRefBonus = 15.15;    // 5% from Nelzateb's $303
  const ziggyCheckin = 0.10;
  const ziggyTotalWithdrawable = Number((ziggy7DaysProfit + ziggyRefBonus + ziggyCheckin).toFixed(2)); // $86.30

  // Update Ziggy's user balance
  await prisma.users.update({
    where: { id: ziggy.id },
    data: {
      balance: 0.00,
      withdrawable_balance: ziggyTotalWithdrawable
    }
  });

  // Update Ziggy's deposit to $203.00
  await prisma.deposits.updateMany({
    where: { user_id: ziggy.id },
    data: { amount: ziggyAmount }
  });

  // Update Ziggy's investment to $203.00, daily $10.15, total_paid $60.90
  const ziggyStartDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const ziggyEndDate = new Date(ziggyStartDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  const ziggyInv = await prisma.investments.findFirst({
    where: { user_id: ziggy.id, status: 'ACTIVE' }
  });

  if (ziggyInv) {
    await prisma.investments.update({
      where: { id: ziggyInv.id },
      data: {
        amount: ziggyAmount,
        daily_profit: ziggyDailyProfit,
        total_paid: ziggy7DaysProfit,
        remaining_paid: ziggyAmount,
        start_date: ziggyStartDate,
        end_date: ziggyEndDate
      }
    });

    // Update 7 profit records to $10.15 each
    await prisma.investment_profits.deleteMany({ where: { investment_id: ziggyInv.id } });
    for (let d = 1; d <= 7; d++) {
      await prisma.investment_profits.create({
        data: {
          investment_id: ziggyInv.id,
          user_id: ziggy.id,
          amount: ziggyDailyProfit,
          paid_date: new Date(ziggyStartDate.getTime() + d * 24 * 60 * 60 * 1000)
        }
      });
    }
  }

  // Update referral commission from Ziggy to RichQueen (5% of 203 = $10.15)
  await prisma.referral_commissions.updateMany({
    where: { user_id: rich.id, from_user_id: ziggy.id },
    data: { amount: 10.15 }
  });

  // ==========================================
  // 3. NELZATEB: $303.00
  // ==========================================
  const nelzAmount = 303.00;
  const nelzDailyProfit = 15.15; // 5% of 303
  const nelzTotalWithdrawable = 0.10; // Checkin only; earns $15.15 at 11:00 PM tonight

  // Start date: Yesterday at 11:00 PM (23:00) so first payout is 11:00 PM tonight
  const nelzStartDate = new Date();
  nelzStartDate.setDate(nelzStartDate.getDate() - 1);
  nelzStartDate.setHours(23, 0, 0, 0);
  const nelzEndDate = new Date(nelzStartDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  // Update Nelz user balance
  await prisma.users.update({
    where: { id: nelz.id },
    data: {
      balance: 0.00,
      withdrawable_balance: nelzTotalWithdrawable
    }
  });

  // Update Nelz deposit to $303.00
  await prisma.deposits.updateMany({
    where: { user_id: nelz.id },
    data: { amount: nelzAmount }
  });

  // Update Nelz investment to $303.00, daily $15.15, total_paid 0.00
  const nelzInv = await prisma.investments.findFirst({
    where: { user_id: nelz.id, status: 'ACTIVE' }
  });

  if (nelzInv) {
    await prisma.investments.update({
      where: { id: nelzInv.id },
      data: {
        amount: nelzAmount,
        daily_profit: nelzDailyProfit,
        total_paid: 0.00,
        remaining_paid: nelzAmount,
        start_date: nelzStartDate,
        end_date: nelzEndDate,
        created_at: nelzStartDate
      }
    });

    // Clear premature profit records
    await prisma.investment_profits.deleteMany({ where: { investment_id: nelzInv.id } });
  }

  // Update referral commission from Nelz to Ziggy (5% of 303 = $15.15)
  await prisma.referral_commissions.updateMany({
    where: { user_id: ziggy.id, from_user_id: nelz.id },
    data: { amount: 15.15 }
  });

  // ==========================================
  // 4. RICH QUEEN: Commission $10.15 + Check-ins $1.94 = $12.09
  // ==========================================
  const richCommission = 10.15;
  const richCheckin = 1.94;
  const richTotalWithdrawable = Number((richCommission + richCheckin).toFixed(2)); // 12.09

  await prisma.users.update({
    where: { id: rich.id },
    data: {
      balance: 0.00,
      withdrawable_balance: richTotalWithdrawable
    }
  });

  console.log('\n--- CLEAN BALANCES & INVESTMENTS SUMMARY ---');
  console.log('1. Motlabaseo Ntseme (Ziggyteb):');
  console.log(`   - Invested: $${ziggyAmount}`);
  console.log(`   - Daily Profit: $${ziggyDailyProfit}/day`);
  console.log(`   - 6 Days Claimed Profit: $${ziggy6DaysProfit}`);
  console.log(`   - 5% Referral Commission from Nelz ($303): $${ziggyRefBonus}`);
  console.log(`   - Withdrawable Balance: $${ziggyTotalWithdrawable}`);
  console.log('2. Nelzateb (nelzateb):');
  console.log(`   - Invested: $${nelzAmount}`);
  console.log(`   - Daily Profit: $${nelzDailyProfit}/day`);
  console.log(`   - Earned Profit: $0.00 (First $15.15 drops at 11:00 PM tonight)`);
  console.log(`   - Withdrawable Balance: $${nelzTotalWithdrawable}`);
  console.log('3. Rich Queen (RichQueen):');
  console.log(`   - 5% Referral Commission from Ziggy ($203): $${richCommission}`);
  console.log(`   - 10 Days Check-in: $${richCheckin}`);
  console.log(`   - Withdrawable Balance: $${richTotalWithdrawable}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
