import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { action, search, ip, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    const where = {};
    
    if (action && action !== 'all') {
      // Map frontend action types to backend action names if needed, or use 'contains'
      if (action === 'login') {
        where.action = { contains: 'login', mode: 'insensitive' };
      } else if (action === 'register') {
        where.action = { contains: 'register', mode: 'insensitive' };
      } else if (action === 'spin') {
        where.action = { contains: 'spin', mode: 'insensitive' };
      } else if (action === 'checkin') {
        where.action = { contains: 'check-in', mode: 'insensitive' };
      } else {
        where.action = action;
      }
    }

    if (ip) {
      where.ip_address = { contains: ip };
    }

    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { id: { equals: search.length === 36 ? search : undefined } }
        ]
      };
    }

    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) {
        where.created_at.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Add one day to dateTo to include the whole day
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        where.created_at.lt = toDate;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get today's start and end date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Stats calculation
    const [
      activities, 
      total,
      activitiesToday,
      activeUsers,
      loginsToday,
      depositsToday,
      withdrawalsToday,
      registrationsToday
    ] = await Promise.all([
      // Paginated activities
      prisma.activity_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limitNum,
        include: {
          user: {
            select: { id: true, email: true, username: true, full_name: true, profile_image: true }
          }
        }
      }),
      // Total count with filters
      prisma.activity_logs.count({ where }),
      // Activities today
      prisma.activity_logs.count({
        where: { created_at: { gte: today } }
      }),
      // Active users (users who had an activity today)
      prisma.activity_logs.groupBy({
        by: ['user_id'],
        where: { created_at: { gte: today } },
      }).then(r => r.length),
      // Logins today
      prisma.activity_logs.count({
        where: {
          created_at: { gte: today },
          action: { contains: 'login', mode: 'insensitive' }
        }
      }),
      // Deposits today
      prisma.deposits.count({
        where: { created_at: { gte: today } }
      }),
      // Withdrawals today
      prisma.withdrawals.count({
        where: { created_at: { gte: today } }
      }),
      // Registrations today
      prisma.users.count({
        where: { created_at: { gte: today } }
      })
    ]);

    const stats = {
      activitiesToday,
      activeUsers,
      loginsToday,
      depositsToday,
      withdrawalsToday,
      registrationsToday
    };

    res.json({
      success: true,
      stats,
      activities,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity logs', details: error.message });
  }
});

export default router;
