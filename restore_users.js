import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting User & Investment Restoration ---');

  // 1. Ensure default Language exists
  let lang = await prisma.languages.findFirst({ where: { language_code: 'en' } });
  if (!lang) {
    lang = await prisma.languages.findFirst();
  }
  if (!lang) {
    lang = await prisma.languages.create({
      data: {
        language_code: 'en',
        language_name: 'English',
        native_name: 'English',
        text_direction: 'ltr',
        is_default: true,
        status: true,
      },
    });
  }

  // 2. Ensure Botswana Country exists
  let botswana = await prisma.countries.findFirst({
    where: {
      OR: [
        { country_name: { equals: 'Botswana', mode: 'insensitive' } },
        { country_code: { equals: 'BW', mode: 'insensitive' } },
      ],
    },
  });

  if (!botswana) {
    botswana = await prisma.countries.create({
      data: {
        country_code: 'BW',
        country_name: 'Botswana',
        currency_symbol: 'P',
        currency_code: 'BWP',
        exchange_rate: 13.5,
        auto_update: false,
        status: true,
      },
    });
    console.log('Created Botswana country record.');
  }

  // Common default password for restored accounts
  const defaultPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 3. Create or Update Inviter / Upliner: RichQueen
  const inviterEmail = 'madelasbongile701@gmail.com';
  let inviter = await prisma.users.findUnique({ where: { email: inviterEmail } });

  if (!inviter) {
    inviter = await prisma.users.create({
      data: {
        email: inviterEmail,
        username: 'RichQueen',
        full_name: 'Rich Queen',
        password_hash: passwordHash,
        country_id: botswana.id,
        language_id: lang.id,
        referral_code: 'RICH' + Math.floor(1000 + Math.random() * 9000),
        balance: 10.155, // 5% commission from 203.10
        withdrawable_balance: 10.155,
        email_verified: true,
        is_active: true,
      },
    });
    console.log(`Created Inviter (Upliner): ${inviter.username} (${inviter.email}) with 5% commission ($10.155)`);
  } else {
    console.log(`Inviter ${inviter.username} already exists. ID: ${inviter.id}`);
  }

  // 4. Create or Update Invitee (Downline): Motlabaseo Ntseme (Ziggyteb)
  const inviteeEmail = 'roytheovic@gmail.com';
  let invitee = await prisma.users.findUnique({ where: { email: inviteeEmail } });

  if (!invitee) {
    invitee = await prisma.users.create({
      data: {
        email: inviteeEmail,
        username: 'Ziggyteb',
        full_name: 'Motlabaseo Ntseme',
        password_hash: passwordHash,
        country_id: botswana.id,
        language_id: lang.id,
        referred_by: inviter.id,
        referral_code: 'ZIGG' + Math.floor(1000 + Math.random() * 9000),
        balance: 0.00,
        withdrawable_balance: 0.62, // As shown in admin screenshot
        email_verified: true,
        is_active: true,
      },
    });
    console.log(`Created Invitee (Downline): ${invitee.username} (${invitee.email}) under ${inviter.username}`);
  } else {
    // Ensure upliner is linked
    invitee = await prisma.users.update({
      where: { id: invitee.id },
      data: {
        referred_by: inviter.id,
        country_id: botswana.id,
        withdrawable_balance: 0.62,
        balance: 0.00,
      },
    });
    console.log(`Updated Invitee: ${invitee.username} linked under ${inviter.username}`);
  }

  // 5. Create Referral Commission Record (5% = $10.155)
  const existingCommission = await prisma.referral_commissions.findFirst({
    where: {
      user_id: inviter.id,
      from_user_id: invitee.id,
    },
  });

  if (!existingCommission) {
    await prisma.referral_commissions.create({
      data: {
        user_id: inviter.id,
        from_user_id: invitee.id,
        amount: 10.155,
        level: 1,
      },
    });
    console.log('Created 5% Referral Commission record for RichQueen.');
  }

  // 6. Find Investment Plan (Growth Contract - 5% daily, duration 90)
  let plan = await prisma.plans.findFirst({
    where: {
      OR: [
        { name: { contains: 'Growth', mode: 'insensitive' } },
        { daily_income: 5.0 },
      ],
    },
  });

  if (!plan) {
    plan = await prisma.plans.findFirst({ where: { status: true } });
  }

  if (!plan) {
    console.error('No investment plan found! Please run node seed_plans.js first.');
    return;
  }

  console.log(`Using plan: ${plan.name} (${plan.daily_income}% daily, duration ${plan.duration} days)`);

  // 7. Create Active Investment of $203.10
  const investAmount = 203.10;
  const dailyProfit = investAmount * (Number(plan.daily_income) / 100); // 10.155
  const totalDays = plan.duration || 90;
  const elapsedDays = 6;
  const totalProfitPaid = Number((dailyProfit * elapsedDays).toFixed(2)); // 60.93

  const startDate = new Date(Date.now() - elapsedDays * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);

  // Check if investment already exists for this user
  let investment = await prisma.investments.findFirst({
    where: {
      user_id: invitee.id,
      amount: investAmount,
    },
  });

  if (!investment) {
    investment = await prisma.investments.create({
      data: {
        user_id: invitee.id,
        plan_id: plan.id,
        amount: investAmount,
        daily_profit: dailyProfit,
        total_paid: totalProfitPaid,
        remaining_paid: investAmount,
        status: 'ACTIVE',
        start_date: startDate,
        end_date: endDate,
        created_at: startDate,
      },
    });
    console.log(`Created Active Investment of $${investAmount} for ${invitee.username}. Total Paid: $${totalProfitPaid}`);
  } else {
    investment = await prisma.investments.update({
      where: { id: investment.id },
      data: {
        daily_profit: dailyProfit,
        total_paid: totalProfitPaid,
        status: 'ACTIVE',
        start_date: startDate,
        end_date: endDate,
      },
    });
    console.log(`Updated Existing Investment ID ${investment.id}`);
  }

  // 8. Create the 6 Daily Profit History Records
  const existingProfits = await prisma.investment_profits.count({
    where: { investment_id: investment.id },
  });

  if (existingProfits < elapsedDays) {
    // Delete any partials and recreate the 6 days cleanly
    await prisma.investment_profits.deleteMany({
      where: { investment_id: investment.id },
    });

    for (let day = 1; day <= elapsedDays; day++) {
      const profitDate = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
      await prisma.investment_profits.create({
        data: {
          investment_id: investment.id,
          user_id: invitee.id,
          amount: dailyProfit,
          paid_date: profitDate,
        },
      });
    }
    console.log(`Created 6 daily profit records ($${dailyProfit} each = $${totalProfitPaid} total).`);
  }

  // 9. Create Approved Deposit Record for $203.10
  const existingDeposit = await prisma.deposits.findFirst({
    where: { user_id: invitee.id, amount: investAmount },
  });

  if (!existingDeposit) {
    await prisma.deposits.create({
      data: {
        user_id: invitee.id,
        amount: investAmount,
        cryptocurrency: 'USDT',
        status: 'APPROVED',
        created_at: startDate,
        approved_at: startDate,
      },
    });
    console.log(`Created Deposit history record for $${investAmount} (APPROVED).`);
  }

  console.log('\n--- RESTORATION SUMMARY ---');
  console.log(`1. Upliner: ${inviter.full_name} (${inviter.email})`);
  console.log(`   - Username: ${inviter.username}`);
  console.log(`   - Default Password: ${defaultPassword}`);
  console.log(`   - 5% Referral Commission: $10.155`);
  console.log(`2. Downline: ${invitee.full_name} (${invitee.email})`);
  console.log(`   - Username: ${invitee.username}`);
  console.log(`   - Default Password: ${defaultPassword}`);
  console.log(`   - Country: Botswana`);
  console.log(`   - Invested: $${investAmount} in ${plan.name}`);
  console.log(`   - Daily Profit: $${dailyProfit}/day`);
  console.log(`   - 6 Days Claimed Profit: $${totalProfitPaid}`);
  console.log(`   - Main Balance: $0.00 | Withdrawable Balance: $0.62`);
  console.log('Restoration completed successfully!');
}

main()
  .catch((err) => {
    console.error('Error during restoration:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
