import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { logActivity } from '../lib/logger.js';

const router = Router();
const prisma = new PrismaClient();

// Get all linked wallets of the user
router.get('/', authenticate, async (req, res) => {
  try {
    const wallets = await prisma.user_wallets.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' }
    });
    res.json({ success: true, wallets });
  } catch (error) {
    console.error('Error fetching linked wallets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch linked wallets' });
  }
});

// Link/Update a wallet address
router.post('/', authenticate, async (req, res) => {
  try {
    const { symbol, network, address, label } = req.body;
    const userId = req.user.id;

    if (!symbol || !network || !address) {
      return res.status(400).json({ success: false, error: 'Missing required fields: symbol, network, address' });
    }

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      return res.status(400).json({ success: false, error: 'Address cannot be empty' });
    }

    // Upsert linked wallet address (unique constraint on user_id, symbol, network)
    const wallet = await prisma.user_wallets.upsert({
      where: {
        user_id_symbol_network: {
          user_id: userId,
          symbol,
          network
        }
      },
      update: {
        address: trimmedAddress,
        label: label || null
      },
      create: {
        user_id: userId,
        symbol,
        network,
        address: trimmedAddress,
        label: label || null
      }
    });

    await logActivity(userId, 'wallet linked', req, { symbol, network, label });

    res.json({ success: true, message: 'Wallet address successfully linked!', wallet });
  } catch (error) {
    console.error('Error linking wallet address:', error);
    res.status(500).json({ success: false, error: 'Failed to link wallet address' });
  }
});

// Delete a linked wallet address
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const wallet = await prisma.user_wallets.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found' });
    }

    if (wallet.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.user_wallets.delete({ where: { id } });

    await logActivity(userId, 'wallet unlinked', req, { symbol: wallet.symbol, network: wallet.network });

    res.json({ success: true, message: 'Wallet address successfully unlinked!' });
  } catch (error) {
    console.error('Error deleting linked wallet:', error);
    res.status(500).json({ success: false, error: 'Failed to delete linked wallet' });
  }
});

export default router;
