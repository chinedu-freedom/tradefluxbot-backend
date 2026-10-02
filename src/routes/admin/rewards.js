import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ----- Gift Codes -----
router.get('/gift-codes', async (req, res) => {
  try {
    const codes = await prisma.gift_codes.findMany({ orderBy: { created_at: 'desc' } });
    res.json(codes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gift codes' });
  }
});

router.post('/gift-codes', async (req, res) => {
  try {
    const data = { ...req.body, created_by: req.user.id };
    const code = await prisma.gift_codes.create({ data });
    res.status(201).json(code);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create gift code' });
  }
});

router.put('/gift-codes/:id', async (req, res) => {
  try {
    const code = await prisma.gift_codes.update({ where: { id: req.params.id }, data: req.body });
    res.json(code);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update gift code' });
  }
});

router.delete('/gift-codes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Cascade delete claims
    await prisma.gift_code_claims.deleteMany({ where: { gift_code_id: id } });
    await prisma.gift_codes.delete({ where: { id } });
    res.json({ message: 'Gift code deleted' });
  } catch (error) {
    if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist') || error.message?.includes('not found')) {
      return res.json({ message: 'Gift code deleted' });
    }
    res.status(500).json({ error: 'Failed to delete gift code' });
  }
});

// ----- Gift Code Claims -----
router.get('/gift-code-claims', async (req, res) => {
  try {
    const claims = await prisma.gift_code_claims.findMany({
      include: {
        user: { select: { id: true, full_name: true, email: true, profile_image: true } },
        gift_code: { select: { code: true } }
      },
      orderBy: { claimed_at: 'desc' }
    });
    res.json(claims);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch gift code claims' });
  }
});

// ----- Tasks -----
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await prisma.tasks.findMany({ orderBy: { created_at: 'desc' } });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const task = await prisma.tasks.create({ data: req.body });
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const task = await prisma.tasks.update({ where: { id: req.params.id }, data: req.body });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Cascade delete claims
    await prisma.task_claims.deleteMany({ where: { task_id: id } });
    await prisma.tasks.delete({ where: { id } });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist') || error.message?.includes('not found')) {
      return res.json({ message: 'Task deleted' });
    }
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ----- Daily Check-Ins -----
router.get('/check-ins', async (req, res) => {
  try {
    let checkins = await prisma.daily_checkins.findMany({ orderBy: { day_number: 'asc' } });
    
    // Auto-seed if empty
    if (checkins.length === 0) {
      const defaultCheckins = [
        { day_number: 1, reward_amount: 0.10, description: "First check-in reward" },
        { day_number: 2, reward_amount: 0.20, description: "Day 2 reward" },
        { day_number: 3, reward_amount: 0.02, description: "Day 3 reward" },
        { day_number: 4, reward_amount: 0.10, description: "Day 4 reward" },
        { day_number: 5, reward_amount: 0.30, description: "Day 5 reward" },
        { day_number: 6, reward_amount: 0.40, description: "Day 6 reward" },
        { day_number: 7, reward_amount: 0.50, description: "Maximum reward - Complete 7 days!" },
      ];
      
      await prisma.daily_checkins.createMany({
        data: defaultCheckins
      });
      
      checkins = await prisma.daily_checkins.findMany({ orderBy: { day_number: 'asc' } });
    }
    
    res.json(checkins);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch check-ins' });
  }
});

router.post('/check-ins', async (req, res) => {
  try {
    const checkin = await prisma.daily_checkins.create({ data: req.body });
    res.status(201).json(checkin);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create check-in day' });
  }
});

router.put('/check-ins/bulk', async (req, res) => {
  try {
    const { checkins } = req.body;
    
    // Process all updates sequentially
    for (const item of checkins) {
      await prisma.daily_checkins.update({
        where: { id: item.id },
        data: {
          reward_amount: item.reward_amount,
          description: item.description
        }
      });
    }
    
    // res.json({ message: 'All check-ins updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update check-ins' });
  }
});

router.put('/check-ins/:id', async (req, res) => {
  try {
    const checkin = await prisma.daily_checkins.update({ where: { id: req.params.id }, data: req.body });
    res.json(checkin);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update check-in day' });
  }
});

router.delete('/check-ins/:id', async (req, res) => {
  try {
    await prisma.daily_checkins.delete({ where: { id: req.params.id } });
    res.json({ message: 'Check-in day deleted' });
  } catch (error) {
    if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist') || error.message?.includes('not found')) {
      return res.json({ message: 'Check-in day deleted' });
    }
    res.status(500).json({ error: 'Failed to delete check-in day' });
  }
});

// ----- Spin Prizes -----
router.get('/spin-prizes', async (req, res) => {
  try {
    const prizes = await prisma.spin_prizes.findMany({
      where: { position: { lte: 8 } },
      orderBy: { position: 'asc' }
    });
    res.json(prizes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch spin prizes' });
  }
});

router.post('/spin-prizes', async (req, res) => {
  try {
    const count = await prisma.spin_prizes.count({
      where: { position: { lte: 8 } }
    });
    if (count >= 8) {
      return res.status(400).json({ error: 'Maximum of 8 spin prizes reached' });
    }
    
    // Ensure position is between 1 and 8
    const position = req.body.position ? Math.min(8, Math.max(1, Number(req.body.position))) : 1;
    const data = { ...req.body, position };

    const prize = await prisma.spin_prizes.create({ data });
    res.status(201).json(prize);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create spin prize' });
  }
});

router.put('/spin-prizes/:id', async (req, res) => {
  try {
    // Ensure we do not modify the constant 9th prize if somehow hit
    const existing = await prisma.spin_prizes.findUnique({ where: { id: req.params.id } });
    if (existing && existing.position === 9) {
      return res.status(400).json({ error: 'Cannot modify system constant prize' });
    }

    const data = { ...req.body };
    if (data.position) {
      data.position = Math.min(8, Math.max(1, Number(data.position)));
    }

    const prize = await prisma.spin_prizes.update({ where: { id: req.params.id }, data });
    res.json(prize);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update spin prize' });
  }
});

router.delete('/spin-prizes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Ensure we do not delete the constant 9th prize
    const existing = await prisma.spin_prizes.findUnique({ where: { id } });
    if (existing && existing.position === 9) {
      return res.status(400).json({ error: 'Cannot delete system constant prize' });
    }

    // Cascade delete logs
    await prisma.spin_logs.deleteMany({ where: { prize_id: id } });
    await prisma.spin_prizes.delete({ where: { id } });
    res.json({ message: 'Spin prize deleted' });
  } catch (error) {
    if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist') || error.message?.includes('not found')) {
      return res.json({ message: 'Spin prize deleted' });
    }
    res.status(500).json({ error: 'Failed to delete spin prize' });
  }
});

// ----- Spin Settings -----
router.get('/spin-settings', async (req, res) => {
  try {
    let settings = await prisma.spin_settings.findFirst();
    if (!settings) {
      settings = await prisma.spin_settings.create({
        data: {
          feature_enabled: true,
          cost_per_spin: 0,
          free_spins_per_deposit: 1,
          daily_referral_target: 1,
          spins_for_daily_challenge: 1,
          free_spins_daily: 1
        }
      });
    }

    // Aggregate stats
    const totalSpinsUsedAggr = await prisma.user_spins.aggregate({ _sum: { total_spins_used: true } });
    const totalRewardsAggr = await prisma.user_spins.aggregate({ _sum: { total_rewards_earned: true } });
    const freeSpinsUsedCount = await prisma.spin_logs.count({ where: { spin_type: 'free' } });

    res.json({
      ...settings,
      total_spins_used: totalSpinsUsedAggr._sum.total_spins_used || 0,
      total_rewards_earned: totalRewardsAggr._sum.total_rewards_earned || 0,
      free_spins_used: freeSpinsUsedCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch spin settings' });
  }
});

router.put('/spin-settings', async (req, res) => {
  try {
    let settings = await prisma.spin_settings.findFirst();
    if (settings) {
      settings = await prisma.spin_settings.update({ where: { id: settings.id }, data: req.body });
    } else {
      settings = await prisma.spin_settings.create({ data: req.body });
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update spin settings' });
  }
});

export default router;
