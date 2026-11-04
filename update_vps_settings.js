import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Ensuring whatsapp_floating_support column exists...");
  await prisma.$executeRawUnsafe('ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "whatsapp_floating_support" TEXT;');

  const s = await prisma.settings.findFirst();
  if (s) {
    await prisma.$executeRawUnsafe(
      `UPDATE "settings" 
       SET "whatsapp_floating_support" = $1, 
           "whatsapp_support" = $2, 
           "whatsapp_group" = $3, 
           "telegram_community" = $4, 
           "telegram_group" = $5 
       WHERE id = $6::uuid`,
      '+44 7344 560920',
      '+44 7344 931677',
      'https://chat.whatsapp.com/DHHHJIHFPzKKWLnYbY68Ms?s=cl&p=i&mlu=4&ilr=4&iam=2',
      'https://t.me/tradefluxbotgroup',
      'https://t.me/tradefluxbotgroup',
      s.id
    );
    console.log("✓ Database updated with the new WhatsApp and Telegram settings.");
  } else {
    console.log("No settings record found to update.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
