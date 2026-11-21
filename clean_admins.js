import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const keepEmail = 'admin@tradefluxbot.com';
  console.log(`[CLEANUP] Scanning database for any rogue or unauthorized admin accounts...`);

  // 1. Ensure the primary admin exists
  const mainAdmin = await prisma.admins.findUnique({
    where: { email: keepEmail }
  });

  if (!mainAdmin) {
    console.error(`[ERROR] Primary admin ${keepEmail} does not exist! Aborting to prevent lockout.`);
    process.exit(1);
  }

  // 2. Find any admin accounts that are NOT admin@tradefluxbot.com
  const rogueAdmins = await prisma.admins.findMany({
    where: {
      email: { not: keepEmail }
    }
  });

  console.log(`[CLEANUP] Found ${rogueAdmins.length} unauthorized admin account(s).`);

  if (rogueAdmins.length === 0) {
    console.log(`✓ Database is clean! Only ${keepEmail} exists in the admins table.`);
    return;
  }

  const rogueIds = rogueAdmins.map((a) => a.id);
  rogueAdmins.forEach((a) => {
    console.log(` - Deleting rogue admin: ID=${a.id}, Email=${a.email}, Role=${a.role}`);
  });

  // 3. Clean up relations
  // Delete admin logs for rogue admins
  const deletedLogs = await prisma.admin_logs.deleteMany({
    where: { admin_id: { in: rogueIds } }
  });
  console.log(` - Removed ${deletedLogs.count} associated admin log(s).`);

  // Reassign gift codes to main admin
  await prisma.gift_codes.updateMany({
    where: { created_by: { in: rogueIds } },
    data: { created_by: mainAdmin.id }
  });

  // Reassign deposit approvals to main admin
  await prisma.deposits.updateMany({
    where: { approved_by: { in: rogueIds } },
    data: { approved_by: mainAdmin.id }
  });

  // Reassign withdrawal processing to main admin
  await prisma.withdrawals.updateMany({
    where: { processed_by: { in: rogueIds } },
    data: { processed_by: mainAdmin.id }
  });

  // 4. Delete the rogue admins
  const result = await prisma.admins.deleteMany({
    where: { id: { in: rogueIds } }
  });

  console.log('--------------------------------------------------');
  console.log(`✓ Successfully deleted ${result.count} rogue admin account(s)!`);
  console.log(`✓ ONLY ${mainAdmin.email} remains as the sole superadmin.`);
  console.log('--------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Failed to clean admin accounts:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

