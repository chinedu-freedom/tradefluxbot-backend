import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Updating global settings...");
  const settings = await prisma.settings.findFirst();
  const settingsData = {
    registration_bonus: 3.0,
    welcome_bonus_destination: "deposit",
    min_deposit: 30.0,
    min_withdrawal: 20.0,
    withdrawal_charge: 5.0,
    level1_commission: 5.0,
    level2_commission: 0.0,
    level3_commission: 0.0,
    level4_commission: 0.0,
  };

  if (settings) {
    await prisma.settings.update({
      where: { id: settings.id },
      data: settingsData,
    });
    console.log("Platform settings updated successfully!");
  } else {
    await prisma.settings.create({
      data: {
        site_name: "TradeFluxBot",
        site_title: "TradeFluxBot - Crypto Mining & Trading Platform",
        currency_name: "USD",
        currency_symbol: "$",
        timezone: "UTC",
        ...settingsData,
      },
    });
    console.log("Platform settings created successfully!");
  }

  console.log("Updating TradeFluxBot investment plans...");
  const plans = [
    {
      name: "Starter",
      description: "Advertised minimum: 3% for 20 days. Fast, short-term earnings.",
      duration: 20,
      daily_income: 3.0,
      min_investment: 30.0,
      max_investment: 99.0,
      capital_return: true,
      is_fixed_deposit: false,
      status: true,
    },
    {
      name: "Growth Contract",
      description: "Deposits & advertised profit available after trading duration is completed.",
      duration: 90,
      daily_income: 5.0,
      min_investment: 100.0,
      max_investment: 9999.0,
      capital_return: true,
      is_fixed_deposit: true,
      status: true,
    },
    {
      name: "Prestige VIP",
      description: "Deposits & advertised profit available after trading duration is completed.",
      duration: 90,
      daily_income: 6.5,
      min_investment: 10000.0,
      max_investment: 1000000.0,
      capital_return: true,
      is_fixed_deposit: true,
      status: true,
    },
  ];

  for (const p of plans) {
    const existing = await prisma.plans.findFirst({
      where: { name: p.name },
    });

    if (existing) {
      await prisma.plans.update({
        where: { id: existing.id },
        data: p,
      });
      console.log(`Updated plan: ${p.name}`);
    } else {
      await prisma.plans.create({
        data: p,
      });
      console.log(`Created plan: ${p.name}`);
    }
  }

  console.log("All plans and settings updated successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
