import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cryptos = [
  { name: "Tether (TRC20)", symbol: "USDT", network: "TRC20", network_name: "Tron Network (TRC20)", icon: "https://assets.coingecko.com/coins/images/325/large/Tether.png", sort_order: 1, status: true },
  { name: "Tether (BEP20)", symbol: "USDT", network: "BEP20", network_name: "BNB Smart Chain (BEP20)", icon: "https://assets.coingecko.com/coins/images/325/large/Tether.png", sort_order: 2, status: true },
  { name: "Bitcoin", symbol: "BTC", network: "Bitcoin", network_name: "Bitcoin Network", icon: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png", sort_order: 3, status: true },
  { name: "Ethereum (ERC20)", symbol: "ETH", network: "ERC20", network_name: "Ethereum Network (ERC20)", icon: "https://assets.coingecko.com/coins/images/279/large/ethereum.png", sort_order: 4, status: true },
  { name: "Litecoin", symbol: "LTC", network: "Litecoin", network_name: "Litecoin Network", icon: "https://assets.coingecko.com/coins/images/2/large/litecoin.png", sort_order: 5, status: true },
  { name: "Tron", symbol: "TRX", network: "TRC20", network_name: "Tron Network", icon: "https://assets.coingecko.com/coins/images/1094/large/tron-logo.png", sort_order: 6, status: true }
];

async function main() {
  console.log("Seeding payout cryptocurrencies...");
  for (const c of cryptos) {
    await prisma.payout_cryptocurrencies.upsert({
      where: {
        symbol_network: {
          symbol: c.symbol,
          network: c.network
        }
      },
      update: c,
      create: c
    });
    console.log(`Seeded: ${c.name}`);
  }
  console.log("Seeding payout cryptocurrencies completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
