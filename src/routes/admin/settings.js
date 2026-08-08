import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getSecurityPassword, setSecurityPassword } from '../../lib/security.js';

const router = Router();
const prisma = new PrismaClient();

// Helper factory for simple CRUD
const createCrudRoutes = (modelName) => {
  const r = Router();
  
  r.get('/', async (req, res) => {
    try {
      const items = await prisma[modelName].findMany();
      res.json(items);
    } catch (e) {
      res.status(500).json({ error: `Failed to fetch ${modelName}` });
    }
  });

  r.get('/:id', async (req, res) => {
    try {
      const item = await prisma[modelName].findUnique({ where: { id: req.params.id } });
      if (!item) {
        return res.status(404).json({ error: `Item not found` });
      }
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: `Failed to fetch ${modelName} by ID` });
    }
  });

  r.post('/', async (req, res) => {
    try {
      const item = await prisma[modelName].create({ data: req.body });
      res.status(201).json(item);
    } catch (e) {
      console.error(`Error creating ${modelName}:`, e);
      res.status(500).json({ error: `Failed to create ${modelName}`, details: e.message });
    }
  });

  r.put('/:id', async (req, res) => {
    try {
      const item = await prisma[modelName].update({ where: { id: req.params.id }, data: req.body });
      res.json(item);
    } catch (e) {
      res.status(500).json({ error: `Failed to update ${modelName}` });
    }
  });

  r.delete('/:id', async (req, res) => {
    try {
      const id = req.params.id;
      // Check if it exists
      const exists = await prisma[modelName].findUnique({ where: { id } });
      if (!exists) {
        return res.json({ message: 'Deleted successfully' });
      }

      // Check if trying to delete country or language with active users
      if (modelName === 'countries') {
        const usersCount = await prisma.users.count({ where: { country_id: id } });
        if (usersCount > 0) {
          return res.status(400).json({ error: 'Cannot delete country because it has registered users' });
        }
      }
      if (modelName === 'languages') {
        const usersCount = await prisma.users.count({ where: { language_id: id } });
        if (usersCount > 0) {
          return res.status(400).json({ error: 'Cannot delete language because it has registered users' });
        }
      }

      await prisma[modelName].delete({ where: { id } });
      res.json({ message: 'Deleted successfully' });
    } catch (e) {
      if (e.code === 'P2025') {
        return res.json({ message: 'Deleted successfully' });
      }
      res.status(500).json({ error: `Failed to delete ${modelName}`, details: e.message });
    }
  });

  return r;
};

// Generic CRUD endpoints for settings tables
router.use('/countries', createCrudRoutes('countries'));
router.use('/languages', createCrudRoutes('languages'));
router.use('/payout-cryptos', createCrudRoutes('payout_cryptocurrencies'));
router.use('/market-assets', createCrudRoutes('market_assets'));

// ----- Global Platform Settings -----
router.get('/platform', async (req, res) => {
  try {
    let settings = await prisma.settings.findFirst();
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          site_name: "Kryptex Mining",
          site_title: "Kryptex Mining",
          currency_name: "USD",
          currency_symbol: "$",
          timezone: "UTC",
          registration_bonus: 0,
          welcome_bonus_destination: "deposit",
          min_deposit: 10,
          max_deposit: 10000,
          daily_withdrawal_limit: 5000,
          min_withdrawal: 10,
          daily_checkin_enabled: true,
          live_market_enabled: true
        }
      });
    }
    res.json(settings || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch platform settings' });
  }
});

router.put('/platform', async (req, res) => {
  try {
    let settings = await prisma.settings.findFirst();
    if (settings) {
      settings = await prisma.settings.update({ where: { id: settings.id }, data: req.body });
    } else {
      settings = await prisma.settings.create({ data: req.body });
    }
    res.json(settings);
  } catch (error) {
    console.error("Settings Update Error:", error);
    res.status(500).json({ error: 'Failed to update platform settings', details: error.message });
  }
});

// ----- Email Settings -----
router.get('/email', async (req, res) => {
  try {
    const settings = await prisma.email_settings.findFirst();
    res.json(settings || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

router.put('/email', async (req, res) => {
  try {
    let settings = await prisma.email_settings.findFirst();
    if (settings) {
      settings = await prisma.email_settings.update({ where: { id: settings.id }, data: req.body });
    } else {
      settings = await prisma.email_settings.create({ data: req.body });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update email settings' });
  }
});

router.get('/email/logs', async (req, res) => {
  try {
    const logs = await prisma.email_logs.findMany({
      orderBy: { sent_at: 'desc' },
      take: 100, // Limit to recent 100 logs
      include: {
        user: {
          select: { email: true, full_name: true }
        }
      }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email logs' });
  }
});

// ----- Verification Password Settings -----
router.get('/security', async (req, res) => {
  try {
    res.json({ success: true, password: getSecurityPassword() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch verification password' });
  }
});

router.put('/security', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }
    const success = setSecurityPassword(password);
    if (success) {
      res.json({ success: true, message: 'Verification password updated successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update verification password' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'An error occurred', details: error.message });
  }
});

export default router;
