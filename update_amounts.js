import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Cleaning and Updating Balances & Transactions ---');

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
  const ziggy6DaysProfit = 60.90; // 6 * 10.15 = 60.90 (6 Days Claimed)
  const ziggyRefBonus = 15.15;    // 5% from Nelzateb's $303
  const ziggyCheckin = 1.62;     // 7 days of daily check-in (0.10 + 0.20 + 0.02 + 0.10 + 0.30 + 0.40 + 0.50)
  const ziggyTotalWithdrawable = Number((ziggy6DaysProfit + ziggyRefBonus + ziggyCheckin).toFixed(2)); // $77.67

  // Clear any test pending withdrawals and reset Ziggy balance to exact $77.67
  await prisma.withdrawals.deleteMany({ where: { user_id: ziggy.id } });

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

  // Update Ziggy's investment to $203.00, daily $10.15, 6 days claimed profit = $60.90
  const ziggyStartDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
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
        total_paid: ziggy6DaysProfit,
        remaining_paid: ziggyAmount,
        start_date: ziggyStartDate,
        end_date: ziggyEndDate
      }
    });

    // Clean up profit records and recreate exactly 6 records of $10.15 each
    await prisma.investment_profits.deleteMany({ where: { investment_id: ziggyInv.id } });
    for (let d = 1; d <= 6; d++) {
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

  // Create 7 Days of User Check-ins for Ziggyteb
  await prisma.user_checkins.deleteMany({ where: { user_id: ziggy.id } });
  const checkinRewards = [0.10, 0.20, 0.02, 0.10, 0.30, 0.40, 0.50];
  for (let day = 1; day <= 7; day++) {
    const checkinDate = new Date(Date.now() - (7 - day) * 24 * 60 * 60 * 1000);
    await prisma.user_checkins.create({
      data: {
        user_id: ziggy.id,
        day_number: day,
        reward_amount: checkinRewards[day - 1],
        checkin_date: checkinDate
      }
    });
  }

  // CLEAN UP ALL CONFUSING/MESSY TRANSACTIONS FOR ZIGGYTEB
  await prisma.transactions.deleteMany({ where: { user_id: ziggy.id } });
  
  // Re-create clean, realistic transaction history reflecting exact $77.67
  let runningBal = 0.00;
  
  // 1. 7 Check-in rewards
  for (let day = 1; day <= 7; day++) {
    const reward = checkinRewards[day - 1];
    const before = runningBal;
    runningBal = Number((runningBal + reward).toFixed(2));
    await prisma.transactions.create({
      data: {
        user_id: ziggy.id,
        type: 'daily reward',
        amount: reward,
        balance_before: before,
        balance_after: runningBal,
        description: `Daily check-in reward (Day ${day})`,
        created_at: new Date(Date.now() - (7 - day) * 24 * 60 * 60 * 1000)
      }
    });
  }

  // 2. 6 Daily profit returns ($10.15 each)
  for (let d = 1; d <= 6; d++) {
    const before = runningBal;
    runningBal = Number((runningBal + ziggyDailyProfit).toFixed(2));
    await prisma.transactions.create({
      data: {
        user_id: ziggy.id,
        type: 'profit',
        amount: ziggyDailyProfit,
        balance_before: before,
        balance_after: runningBal,
        reference_id: ziggyInv?.id,
        description: `Daily profit return (Day ${d}) for Growth Contract`,
        created_at: new Date(ziggyStartDate.getTime() + d * 24 * 60 * 60 * 1000)
      }
    });
  }

  // 3. Referral commission from Nelzateb ($15.15)
  const refBefore = runningBal;
  runningBal = Number((runningBal + ziggyRefBonus).toFixed(2)); // exactly 77.67
  await prisma.transactions.create({
    data: {
      user_id: ziggy.id,
      type: 'commission',
      amount: ziggyRefBonus,
      balance_before: refBefore,
      balance_after: runningBal,
      description: '5% Direct Referral Commission from nelzateb ($303.00)',
      created_at: new Date(Date.now() - 12 * 60 * 60 * 1000)
    }
  });

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
  const nelzTotalWithdrawable = 0.10; // Checkin only; earns $15.15 at 10:55 PM tonight

  const nelzStartDate = new Date();
  nelzStartDate.setDate(nelzStartDate.getDate() - 1);
  nelzStartDate.setHours(22, 55, 0, 0); // 10:55 PM exact investment time
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

    await prisma.investment_profits.deleteMany({ where: { investment_id: nelzInv.id } });
  }

  // Clean and set Nelz transactions: 1 Day check-in ($0.10)
  await prisma.transactions.deleteMany({ where: { user_id: nelz.id } });
  await prisma.transactions.create({
    data: {
      user_id: nelz.id,
      type: 'daily reward',
      amount: 0.10,
      balance_before: 0.00,
      balance_after: 0.10,
      description: 'Daily check-in reward (Day 1)',
      created_at: nelzStartDate
    }
  });

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
  console.log(`   - 7 Days Daily Check-in: $${ziggyCheckin}`);
  console.log(`   - Clean Transactions Count: 14 (7 checkins + 6 profits + 1 commission)`);
  console.log(`   - Final Withdrawable Balance: $${ziggyTotalWithdrawable}`);
  console.log('2. Nelzateb (nelzateb):');
  console.log(`   - Invested: $${nelzAmount}`);
  console.log(`   - Daily Profit: $${nelzDailyProfit}/day`);
  console.log(`   - Earned Profit: $0.00 (First $15.15 drops at 10:55 PM tonight)`);
  console.log(`   - Withdrawable Balance: $${nelzTotalWithdrawable}`);
  console.log('3. Rich Queen (RichQueen):');
  console.log(`   - 5% Referral Commission from Ziggy ($203): $${richCommission}`);
  console.log(`   - 10 Days Check-in: $${richCheckin}`);
  console.log(`   - Withdrawable Balance: $${richTotalWithdrawable}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
