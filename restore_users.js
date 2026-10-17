import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting User & Investment Restoration ---');

  // 1. Language
  let lang = await prisma.languages.findFirst({ where: { language_code: 'en' } });
  if (!lang) lang = await prisma.languages.findFirst();
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

  // 2. Botswana
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
  }

  // 3. Ensure all plans have is_fixed_deposit = false
  await prisma.plans.updateMany({
    data: { is_fixed_deposit: false }
  });
  console.log('Ensured all plans have is_fixed_deposit = false.');

  const plan = await prisma.plans.findFirst({
    where: { name: { contains: 'Growth', mode: 'insensitive' } }
  }) || await prisma.plans.findFirst({ where: { status: true } });

  const defaultPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 4. Inviter: RichQueen
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
        balance: 0.00,
        withdrawable_balance: 12.095, // 5% commission from Ziggyteb's 203.10
        email_verified: true,
        is_active: true,
      },
    });
    console.log(`Created Upliner: ${inviter.username} (${inviter.email})`);
  }

  // 5. Downline 1: Motlabaseo Ntseme (Ziggyteb)
  const ziggyEmail = 'roytheovic@gmail.com';
  let ziggy = await prisma.users.findUnique({ where: { email: ziggyEmail } });
  if (!ziggy) {
    ziggy = await prisma.users.create({
      data: {
        email: ziggyEmail,
        username: 'Ziggyteb',
        full_name: 'Motlabaseo Ntseme',
        password_hash: passwordHash,
        country_id: botswana.id,
        language_id: lang.id,
        referred_by: inviter.id,
        referral_code: 'ZIGG' + Math.floor(1000 + Math.random() * 9000),
        balance: 0.00,
        withdrawable_balance: 76.185, // From admin screenshot
        email_verified: true,
        is_active: true,
      },
    });
    console.log(`Created Downline: ${ziggy.username} (${ziggy.email})`);
  }

  // Commission from Ziggyteb to RichQueen
  const comm1 = await prisma.referral_commissions.findFirst({
    where: { user_id: inviter.id, from_user_id: ziggy.id }
  });
  if (!comm1) {
    await prisma.referral_commissions.create({
      data: { user_id: inviter.id, from_user_id: ziggy.id, amount: 10.155, level: 1 }
    });
  }

  // Ziggyteb Investment: $203.10 in Growth Contract, 6 days claimed ($60.93)
  const ziggyInvestAmount = 203.10;
  const ziggyDailyProfit = ziggyInvestAmount * (Number(plan.daily_income) / 100); // 10.155
  const ziggyStartDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const ziggyEndDate = new Date(ziggyStartDate.getTime() + (plan.duration || 90) * 24 * 60 * 60 * 1000);

  let ziggyInv = await prisma.investments.findFirst({
    where: { user_id: ziggy.id, amount: ziggyInvestAmount }
  });
  if (!ziggyInv) {
    ziggyInv = await prisma.investments.create({
      data: {
        user_id: ziggy.id,
        plan_id: plan.id,
        amount: ziggyInvestAmount,
        daily_profit: ziggyDailyProfit,
        total_paid: 60.93,
        remaining_paid: ziggyInvestAmount,
        status: 'ACTIVE',
        start_date: ziggyStartDate,
        end_date: ziggyEndDate,
        created_at: ziggyStartDate
      }
    });
    console.log(`Created Investment for ${ziggy.username}: $${ziggyInvestAmount}`);
  }

  // Profit records for Ziggyteb (6 days)
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

  // Ziggyteb Deposit
  const ziggyDep = await prisma.deposits.findFirst({ where: { user_id: ziggy.id, amount: ziggyInvestAmount } });
  if (!ziggyDep) {
    await prisma.deposits.create({
      data: {
        user_id: ziggy.id,
        amount: ziggyInvestAmount,
        cryptocurrency: 'USDT',
        status: 'APPROVED',
        created_at: ziggyStartDate,
        approved_at: ziggyStartDate
      }
    });
  }

  // 6. User 3: Nelzateb (tebnelz@gmail.com)
  const nelzEmail = 'tebnelz@gmail.com';
  let nelz = await prisma.users.findUnique({ where: { email: nelzEmail } });
  if (!nelz) {
    nelz = await prisma.users.create({
      data: {
        email: nelzEmail,
        username: 'nelzateb',
        full_name: 'Nelzateb',
        password_hash: passwordHash,
        country_id: botswana.id,
        language_id: lang.id,
        referred_by: ziggy.id, // Linked under Ziggyteb (or RichQueen)
        referral_code: 'NELZ' + Math.floor(1000 + Math.random() * 9000),
        balance: 0.00,
        withdrawable_balance: 15.155, // 1st day earning starting 11am today
        email_verified: true,
        is_active: true,
      },
    });
    console.log(`Created New User: ${nelz.username} (${nelz.email})`);
  } else {
    nelz = await prisma.users.update({
      where: { id: nelz.id },
      data: {
        username: 'nelzateb',
        withdrawable_balance: 15.155,
        referred_by: ziggy.id,
      }
    });
    console.log(`Updated User: ${nelz.username}`);
  }

  // Nelzateb Investment: $303.10 in Growth Contract, started 11am today
  const nelzInvestAmount = 303.10;
  const nelzDailyProfit = nelzInvestAmount * (Number(plan.daily_income) / 100); // 15.155
  const today11am = new Date();
  today11am.setHours(11, 0, 0, 0);
  const nelzEndDate = new Date(today11am.getTime() + (plan.duration || 90) * 24 * 60 * 60 * 1000);

  let nelzInv = await prisma.investments.findFirst({
    where: { user_id: nelz.id, amount: nelzInvestAmount }
  });
  if (!nelzInv) {
    nelzInv = await prisma.investments.create({
      data: {
        user_id: nelz.id,
        plan_id: plan.id,
        amount: nelzInvestAmount,
        daily_profit: nelzDailyProfit,
        total_paid: nelzDailyProfit, // 1st day claimed today at 11am
        remaining_paid: nelzInvestAmount,
        status: 'ACTIVE',
        start_date: today11am,
        end_date: nelzEndDate,
        created_at: today11am
      }
    });
    console.log(`Created Investment for ${nelz.username}: $${nelzInvestAmount} (Earned 1st day: $${nelzDailyProfit})`);
  } else {
    await prisma.investments.update({
      where: { id: nelzInv.id },
      data: {
        daily_profit: nelzDailyProfit,
        total_paid: nelzDailyProfit,
        status: 'ACTIVE',
        start_date: today11am,
        end_date: nelzEndDate
      }
    });
  }

  // Nelzateb Profit record for today 11am
  await prisma.investment_profits.deleteMany({ where: { investment_id: nelzInv.id } });
  await prisma.investment_profits.create({
    data: {
      investment_id: nelzInv.id,
      user_id: nelz.id,
      amount: nelzDailyProfit,
      paid_date: today11am
    }
  });

  // Nelzateb Deposit
  const nelzDep = await prisma.deposits.findFirst({ where: { user_id: nelz.id, amount: nelzInvestAmount } });
  if (!nelzDep) {
    await prisma.deposits.create({
      data: {
        user_id: nelz.id,
        amount: nelzInvestAmount,
        cryptocurrency: 'USDT',
        status: 'APPROVED',
        created_at: today11am,
        approved_at: today11am
      }
    });
  }

  // Commission from Nelzateb to Ziggyteb (5% = $15.155)
  const comm2 = await prisma.referral_commissions.findFirst({
    where: { user_id: ziggy.id, from_user_id: nelz.id }
  });
  if (!comm2) {
    await prisma.referral_commissions.create({
      data: { user_id: ziggy.id, from_user_id: nelz.id, amount: 15.155, level: 1 }
    });
    // Add 15.155 to Ziggyteb withdrawable balance as referral earnings
    await prisma.users.update({
      where: { id: ziggy.id },
      data: {
        withdrawable_balance: { increment: 15.155 }
      }
    });
    console.log(`Credited 5% Referral Commission ($15.155) to ${ziggy.username} from ${nelz.username}`);
  }

  console.log('\n--- ALL USERS RESTORED SUCCESSFULLY ---');
  console.log('1. RichQueen (madelasbongile701@gmail.com): Upliner');
  console.log('2. Ziggyteb (roytheovic@gmail.com): $203.10 invested, 6 days claimed ($60.93)');
  console.log('3. nelzateb (tebnelz@gmail.com): $303.10 invested, 1st day earned at 11am ($15.155)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
