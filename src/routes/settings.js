import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get public settings (like contact links, etc)
router.get('/', async (req, res) => {
  try {
    const settings = await prisma.settings.findFirst({
      select: {
        site_name: true,
        site_title: true,
        currency_symbol: true,
        currency_name: true,
        timezone: true,
        platform_logo: true,
        telegram_support: true,
        whatsapp_support: true,
        telegram_community: true,
        telegram_group: true,
        whatsapp_group: true,
        deposit_notice: true,
        withdrawal_notice: true,
        min_withdrawal: true,
        max_withdrawal: true,
        withdrawal_charge: true,
        min_deposit: true,
        max_deposit: true,
        deposit_charge: true,
        live_market_enabled: true
      }
    });
    
    res.json({ success: true, settings: settings || {} });
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// Fixed Supported Cryptocurrencies (Matches Stakelab exactly: Tether TRC20, Tether BEP20, Bitcoin, Litecoin)
export const FIXED_CRYPTOS = [
  { name: "Tether (TRC20)", symbol: "USDT", network: "TRC20", network_name: "Tron Network (TRC20)", icon: "https://assets.coingecko.com/coins/images/325/large/Tether.png", sort_order: 1, status: true },
  { name: "Tether (BEP20)", symbol: "USDT", network: "BEP20", network_name: "BNB Smart Chain (BEP20)", icon: "https://assets.coingecko.com/coins/images/325/large/Tether.png", sort_order: 2, status: true },
  { name: "Bitcoin", symbol: "BTC", network: "Bitcoin", network_name: "Bitcoin Network", icon: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png", sort_order: 3, status: true },
  { name: "Litecoin", symbol: "LTC", network: "Litecoin", network_name: "Litecoin Network", icon: "https://assets.coingecko.com/coins/images/2/large/litecoin.png", sort_order: 4, status: true }
];

// Get active payout cryptocurrencies for deposit options
router.get("/payout-cryptos", async (req, res) => {
  try {
    let cryptos = await prisma.payout_cryptocurrencies.findMany({
      where: {
        status: true,
        symbol: { in: ["USDT", "BTC", "LTC"] }
      },
      orderBy: { sort_order: "asc" }
    });

    if (!cryptos || cryptos.length === 0) {
      for (const c of FIXED_CRYPTOS) {
        await prisma.payout_cryptocurrencies.upsert({
          where: { symbol_network: { symbol: c.symbol, network: c.network } },
          update: c,
          create: c
        });
      }
      cryptos = await prisma.payout_cryptocurrencies.findMany({
        where: {
          status: true,
          symbol: { in: ["USDT", "BTC", "LTC"] }
        },
        orderBy: { sort_order: "asc" }
      });
    }

    res.json({ success: true, data: cryptos });
  } catch (error) {
    console.error("Failed to fetch payout cryptos:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cryptos" });
  }
});

export default router;
