import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Adjusting Nelzateb (tebnelz@gmail.com) Payout Timing ---');

  const nelz = await prisma.users.findUnique({
    where: { email: 'tebnelz@gmail.com' }
  });

  if (!nelz) {
    console.error('User tebnelz@gmail.com not found!');
    return;
  }

  // Find his Growth Contract investment
  const inv = await prisma.investments.findFirst({
    where: { user_id: nelz.id, status: 'ACTIVE' }
  });

  if (!inv) {
    console.error('No active investment found for nelzateb!');
    return;
  }

  // Set start_date to yesterday at 11:00 PM (23:00)
  // End date: 90 days after start date
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1); // Yesterday
  startDate.setHours(23, 0, 0, 0); // 11:00 PM

  const endDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  // 1. Reset investment total_paid to 0
  await prisma.investments.update({
    where: { id: inv.id },
    data: {
      total_paid: 0.00,
      start_date: startDate,
      end_date: endDate,
      created_at: startDate
    }
  });
  console.log(`Reset investment total_paid to $0.00. Start date set to: ${startDate.toISOString()}`);

  // 2. Remove premature profit records
  const deletedProfits = await prisma.investment_profits.deleteMany({
    where: { investment_id: inv.id }
  });
  console.log(`Deleted ${deletedProfits.count} premature profit records.`);

  // 3. Deduct the premature $15.155 from withdrawable balance
  const currentWithdrawable = Number(nelz.withdrawable_balance || 0);
  const adjustedWithdrawable = Math.max(0, Number((currentWithdrawable - 15.155).toFixed(3)));

  await prisma.users.update({
    where: { id: nelz.id },
    data: {
      withdrawable_balance: adjustedWithdrawable
    }
  });
  console.log(`Updated withdrawable balance from $${currentWithdrawable} to $${adjustedWithdrawable}`);

  console.log('\n--- ADJUSTMENT COMPLETE ---');
  console.log('Nelzateb investment is active ($303.10).');
  console.log('Current Earned: $0.00');
  console.log('First 24-hour daily return ($15.155) will automatically drop at 11:00 PM tonight!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
