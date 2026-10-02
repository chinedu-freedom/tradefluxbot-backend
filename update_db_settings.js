import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Updating database settings table...");
  const settings = await prisma.settings.findFirst();
  if (settings) {
    await prisma.settings.update({
      where: { id: settings.id },
      data: {
        site_name: "TradeFluxBot",
        site_title: "TradeFluxBot - Crypto Mining & Trading Platform"
      }
    });
    console.log("Database settings table updated successfully!");
  } else {
    await prisma.settings.create({
      data: {
        site_name: "TradeFluxBot",
        site_title: "TradeFluxBot - Crypto Mining & Trading Platform",
        currency_name: "USD",
        currency_symbol: "$",
        timezone: "UTC",
        welcome_bonus_destination: "balance",
        daily_withdrawal_limit: 50000,
        min_withdrawal: 20,
        max_withdrawal: 100000,
        min_deposit: 10,
        max_deposit: 100000
      }
    });
    console.log("Database settings table created successfully!");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
