import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logActivity } from '../../lib/logger.js';
import { getSecurityPassword } from '../../lib/security.js';

const router = Router();
const prisma = new PrismaClient();

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        country: true
      }
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});


// Get user details (including Upliner and Downliners)
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.params.id },
      include: {
        country: true,
        referrer: {
          include: {
            country: true
          }
        },
        transactions: { orderBy: { created_at: 'desc' }, take: 25 },
        investments: { orderBy: { created_at: 'desc' } }
      }
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // 1. Calculate Upliner details and commissions paid to upliner by this user
    let upliner = null;
    if (user.referrer) {
      const uplinerCommissions = await prisma.referral_commissions.findMany({
        where: {
          user_id: user.referrer.id,
          from_user_id: user.id
        }
      });
      const uplinerCommissionTotal = uplinerCommissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

      upliner = {
        id: user.referrer.id,
        full_name: user.referrer.full_name,
        username: user.referrer.username,
        email: user.referrer.email,
        profile_image: user.referrer.profile_image,
        referral_code: user.referrer.referral_code,
        country: user.referrer.country?.country_name || 'N/A',
        created_at: user.referrer.created_at,
        balance: Number(user.referrer.balance || 0),
        withdrawable_balance: Number(user.referrer.withdrawable_balance || 0),
        is_active: user.referrer.is_active,
        total_commission_from_user: uplinerCommissionTotal
      };
    }

    // 2. Fetch direct downliners (Level 1)
    const level1Users = await prisma.users.findMany({
      where: { referred_by: user.id },
      include: {
        country: true,
        deposits: {
          where: { status: 'COMPLETED' },
          select: { amount: true }
        },
        investments: {
          select: { amount: true, status: true }
        },
        _count: {
          select: { referrals: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // 3. Fetch Level 2 downliners
    const level1Ids = level1Users.map(u => u.id);
    let level2Users = [];
    if (level1Ids.length > 0) {
      level2Users = await prisma.users.findMany({
        where: { referred_by: { in: level1Ids } },
        include: {
          country: true,
          referrer: {
            select: { id: true, full_name: true, username: true, email: true }
          },
          deposits: {
            where: { status: 'COMPLETED' },
            select: { amount: true }
          },
          investments: {
            select: { amount: true, status: true }
          }
        },
        orderBy: { created_at: 'desc' }
      });
    }

    // 4. Fetch commissions earned by this user
    const earnedCommissions = await prisma.referral_commissions.findMany({
      where: { user_id: user.id },
      include: {
        giver: {
          select: { id: true, full_name: true, username: true, email: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const totalCommissionEarned = earnedCommissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    // Format downliners
    const formattedLevel1 = level1Users.map(l1 => {
      const totalDeposited = l1.deposits.reduce((acc, d) => acc + Number(d.amount || 0), 0);
      const totalInvested = l1.investments.reduce((acc, inv) => acc + Number(inv.amount || 0), 0);
      const commissionFromThisUser = earnedCommissions
        .filter(c => c.from_user_id === l1.id)
        .reduce((acc, c) => acc + Number(c.amount || 0), 0);

      return {
        id: l1.id,
        full_name: l1.full_name,
        username: l1.username,
        email: l1.email,
        profile_image: l1.profile_image,
        referral_code: l1.referral_code,
        country: l1.country?.country_name || 'N/A',
        created_at: l1.created_at,
        is_active: l1.is_active,
        balance: Number(l1.balance || 0),
        withdrawable_balance: Number(l1.withdrawable_balance || 0),
        total_deposited: totalDeposited,
        total_invested: totalInvested,
        commission_generated: commissionFromThisUser,
        sub_referrals_count: l1._count?.referrals || 0,
        level: 1
      };
    });

    const formattedLevel2 = level2Users.map(l2 => {
      const totalDeposited = l2.deposits.reduce((acc, d) => acc + Number(d.amount || 0), 0);
      const totalInvested = l2.investments.reduce((acc, inv) => acc + Number(inv.amount || 0), 0);
      const commissionFromThisUser = earnedCommissions
        .filter(c => c.from_user_id === l2.id)
        .reduce((acc, c) => acc + Number(c.amount || 0), 0);

      return {
        id: l2.id,
        full_name: l2.full_name,
        username: l2.username,
        email: l2.email,
        profile_image: l2.profile_image,
        referral_code: l2.referral_code,
        country: l2.country?.country_name || 'N/A',
        created_at: l2.created_at,
        is_active: l2.is_active,
        balance: Number(l2.balance || 0),
        withdrawable_balance: Number(l2.withdrawable_balance || 0),
        total_deposited: totalDeposited,
        total_invested: totalInvested,
        commission_generated: commissionFromThisUser,
        referred_by_user: l2.referrer ? {
          id: l2.referrer.id,
          name: l2.referrer.full_name || l2.referrer.username
        } : null,
        level: 2
      };
    });

    // Merge everything into response
    const userResponse = {
      ...user,
      upliner,
      downliners_summary: {
        total_team_count: formattedLevel1.length + formattedLevel2.length,
        level1_count: formattedLevel1.length,
        level2_count: formattedLevel2.length,
        total_commission_earned: totalCommissionEarned
      },
      downliners: [...formattedLevel1, ...formattedLevel2],
      referral_commissions: earnedCommissions.map(c => ({
        id: c.id,
        amount: Number(c.amount || 0),
        level: c.level,
        created_at: c.created_at,
        from_user: c.giver ? {
          id: c.giver.id,
          name: c.giver.full_name || c.giver.username,
          email: c.giver.email
        } : null
      }))
    };

    res.json({ success: true, data: userResponse });
  } catch (error) {
    console.error('Failed to fetch user details:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user', details: error.message });
  }
});

// Update user settings/permissions
router.put('/:id', async (req, res) => {
  try {
    const rawData = { ...req.body };
    const userId = req.params.id;

    // Check if user exists
    const existingUser = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const dataToUpdate = {};

    // 1. Full name
    if (rawData.full_name !== undefined && typeof rawData.full_name === 'string') {
      dataToUpdate.full_name = rawData.full_name.trim();
    }

    // 2. Username
    if (rawData.username !== undefined) {
      const usernameTrimmed = typeof rawData.username === 'string' ? rawData.username.trim() : null;
      if (usernameTrimmed && usernameTrimmed !== existingUser.username) {
        const userWithUsername = await prisma.users.findFirst({
          where: { username: usernameTrimmed, id: { not: userId } }
        });
        if (userWithUsername) {
          return res.status(400).json({ success: false, error: 'Username is already taken by another account' });
        }
        dataToUpdate.username = usernameTrimmed;
      }
    }

    // 3. Email
    if (rawData.email !== undefined && typeof rawData.email === 'string') {
      const emailTrimmed = rawData.email.trim();
      if (emailTrimmed && emailTrimmed !== existingUser.email) {
        const userWithEmail = await prisma.users.findFirst({
          where: { email: emailTrimmed, id: { not: userId } }
        });
        if (userWithEmail) {
          return res.status(400).json({ success: false, error: 'Email is already registered to another account' });
        }
        dataToUpdate.email = emailTrimmed;
      }
    }

    // 4. Password reset / update
    const plainPassword = (rawData.new_password || rawData.password || '').toString().trim();
    let passwordUpdated = false;
    if (plainPassword && plainPassword.length > 0) {
      dataToUpdate.password_hash = await bcrypt.hash(plainPassword, 10);
      passwordUpdated = true;
    }

    // 5. Country ID (Validate UUID and foreign key existence)
    if (rawData.country_id && rawData.country_id !== 'none' && rawData.country_id !== '') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(rawData.country_id)) {
        const countryExists = await prisma.countries.findUnique({
          where: { id: rawData.country_id }
        });
        if (countryExists) {
          dataToUpdate.country_id = rawData.country_id;
        }
      }
    }

    // 6. Profile image
    if (rawData.profile_image !== undefined) {
      dataToUpdate.profile_image = rawData.profile_image || null;
    }

    // 7. Boolean flags & permissions
    if (rawData.is_active !== undefined) {
      dataToUpdate.is_active = Boolean(rawData.is_active);
    }
    if (rawData.can_deposit !== undefined) {
      dataToUpdate.can_deposit = Boolean(rawData.can_deposit);
    }
    if (rawData.can_withdraw !== undefined) {
      dataToUpdate.can_withdraw = Boolean(rawData.can_withdraw);
    }
    if (rawData.can_earn_daily !== undefined) {
      dataToUpdate.can_earn_daily = Boolean(rawData.can_earn_daily);
    }
    if (rawData.can_earn_referral !== undefined) {
      dataToUpdate.can_earn_referral = Boolean(rawData.can_earn_referral);
    }
    if (rawData.can_access_spin !== undefined) {
      dataToUpdate.can_access_spin = Boolean(rawData.can_access_spin);
    }
    if (rawData.can_access_checkin !== undefined) {
      dataToUpdate.can_access_checkin = Boolean(rawData.can_access_checkin);
    }

    // Perform update
    const user = await prisma.users.update({
      where: { id: userId },
      data: dataToUpdate,
      include: {
        country: true
      }
    });

    if (rawData.is_active !== undefined && rawData.is_active !== existingUser.is_active) {
      const action = rawData.is_active ? 'user unbanned' : 'user banned';
      await logActivity(user.id, action, req);
    }

    if (passwordUpdated) {
      await logActivity(user.id, 'password reset by admin', req);
    }

    res.json({
      success: true,
      message: passwordUpdated ? 'Password and customer profile updated successfully' : 'Customer profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update user' });
  }
});

// Helper to check admin verification password
async function verifyAdminAuth(adminPassword, reqUser) {
  if (!adminPassword) return false;
  if (adminPassword === getSecurityPassword()) return true;
  if (reqUser && reqUser.id) {
    const adminRecord = await prisma.admins.findUnique({ where: { id: reqUser.id } });
    if (adminRecord && await bcrypt.compare(adminPassword, adminRecord.password_hash)) {
      return true;
    }
  }
  return false;
}

// Manual Credit
router.post('/:id/credit', async (req, res) => {
  const { amount, reason, balance_type, adminPassword } = req.body;
  try {
    if (!adminPassword) {
      return res.status(400).json({ success: false, error: 'Admin password is required' });
    }

    const isAuthorized = await verifyAdminAuth(adminPassword, req.user);
    if (!isAuthorized) {
      return res.status(401).json({ success: false, error: 'Incorrect admin password' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid credit amount' });
    }

    const user = await prisma.users.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const isWithdrawable = balance_type === 'withdrawable';
    const currentBalance = isWithdrawable ? Number(user.withdrawable_balance) : Number(user.balance);
    const newBalance = currentBalance + numAmount;

    const updateData = {};
    if (isWithdrawable) updateData.withdrawable_balance = newBalance;
    else updateData.balance = newBalance;

    const updatedUser = await prisma.$transaction([
      prisma.users.update({
        where: { id: user.id },
        data: updateData
      }),
      prisma.transactions.create({
        data: {
          user_id: user.id,
          type: 'ADMIN_CREDIT',
          amount: numAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: reason || 'DEPOSIT SUCCESSFUL'
        }
      })
    ]);

    await logActivity(user.id, 'admin credit', req, { amount: numAmount, reason, balance_type });

    res.json({
      success: true,
      message: `Successfully credited ${numAmount.toFixed(2)} to ${isWithdrawable ? 'withdrawable' : 'main'} balance`,
      user: updatedUser[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Credit failed', details: error.message });
  }
});

// Manual Debit
router.post('/:id/debit', async (req, res) => {
  const { amount, reason, balance_type, adminPassword } = req.body;
  try {
    if (!adminPassword) {
      return res.status(400).json({ success: false, error: 'Admin password is required' });
    }

    const isAuthorized = await verifyAdminAuth(adminPassword, req.user);
    if (!isAuthorized) {
      return res.status(401).json({ success: false, error: 'Incorrect admin password' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid debit amount' });
    }

    const user = await prisma.users.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const isWithdrawable = balance_type === 'withdrawable';
    const currentBalance = isWithdrawable ? Number(user.withdrawable_balance) : Number(user.balance);
    if (currentBalance < numAmount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance for debit' });
    }
    const newBalance = currentBalance - numAmount;

    const updateData = {};
    if (isWithdrawable) updateData.withdrawable_balance = newBalance;
    else updateData.balance = newBalance;

    const updatedUser = await prisma.$transaction([
      prisma.users.update({
        where: { id: user.id },
        data: updateData
      }),
      prisma.transactions.create({
        data: {
          user_id: user.id,
          type: 'ADMIN_DEBIT',
          amount: numAmount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: reason || 'Manual debit by admin'
        }
      })
    ]);

    await logActivity(user.id, 'admin debit', req, { amount: numAmount, reason, balance_type });

    res.json({
      success: true,
      message: `Successfully deducted ${numAmount.toFixed(2)} from ${isWithdrawable ? 'withdrawable' : 'main'} balance`,
      user: updatedUser[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Debit failed', details: error.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Check if user exists to be idempotent
    const userExists = await prisma.users.findUnique({ where: { id: userId } });
    if (!userExists) {
      return res.json({ success: true, message: 'User already deleted' });
    }
    
    // Nullify referrals
    await prisma.users.updateMany({ where: { referred_by: userId }, data: { referred_by: null } });

    // Manual cascade delete
    await prisma.investment_profits.deleteMany({ where: { user_id: userId } });
    await prisma.transactions.deleteMany({ where: { user_id: userId } });
    await prisma.investments.deleteMany({ where: { user_id: userId } });
    await prisma.deposits.deleteMany({ where: { user_id: userId } });
    await prisma.withdrawals.deleteMany({ where: { user_id: userId } });
    await prisma.spin_logs.deleteMany({ where: { user_id: userId } });
    await prisma.user_checkins.deleteMany({ where: { user_id: userId } });
    await prisma.task_claims.deleteMany({ where: { user_id: userId } });
    await prisma.gift_code_claims.deleteMany({ where: { user_id: userId } });
    await prisma.referral_commissions.deleteMany({ where: { OR: [{ user_id: userId }, { from_user_id: userId }] } });
    await prisma.activity_logs.deleteMany({ where: { user_id: userId } });
    await prisma.email_logs.deleteMany({ where: { user_id: userId } });
    await prisma.user_spins.deleteMany({ where: { user_id: userId } });
    await prisma.password_resets.deleteMany({ where: { user_id: userId } });
    
    // Finally, delete the user
    await prisma.users.delete({
      where: { id: userId }
    });
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025' || error.message?.includes('Record to delete does not exist') || error.message?.includes('not found')) {
      return res.json({ success: true, message: 'User deleted successfully' });
    }
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

// Impersonate user
router.post('/:id/impersonate', async (req, res) => {
  try {
    const user = await prisma.users.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Generate a user token (same as what normal login generates)
    const jwt = await import('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
    const token = jwt.default.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '2h' });
    
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate impersonation token', details: error.message });
  }
});

export default router;
