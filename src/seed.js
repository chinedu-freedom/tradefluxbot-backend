import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding defaults...');

  // 1. Create a Default Country
  const defaultCountry = await prisma.countries.upsert({
    where: { country_code: 'US' },
    update: {},
    create: {
      country_code: 'US',
      country_name: 'United States',
      currency_symbol: '$',
      currency_code: 'USD',
      exchange_rate: 1.0,
      auto_update: false,
    },
  });
  console.log(`Default Country: ${defaultCountry.country_name} (${defaultCountry.id})`);

  // 2. Create a Default Language
  const defaultLanguage = await prisma.languages.upsert({
    where: { language_code: 'en' },
    update: {},
    create: {
      language_code: 'en',
      language_name: 'English',
      native_name: 'English',
      flag_emoji: '🇺🇸',
      text_direction: 'ltr',
      is_default: true,
    },
  });
  console.log(`Default Language: ${defaultLanguage.language_name} (${defaultLanguage.id})`);

  // 3. Create a default Admin
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.admins.upsert({
    where: { email: 'admin@tradefluxbot.com' },
    update: {},
    create: {
      email: 'admin@tradefluxbot.com',
      password_hash: adminPassword,
      role: 'superadmin',
    },
  });
  console.log(`Default Admin: ${admin.email} / admin123`);

  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
