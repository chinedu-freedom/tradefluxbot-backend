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


// Get user details
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.params.id },
      include: {
        country: true,
        transactions: { orderBy: { created_at: 'desc' }, take: 10 },
        investments: true
      }
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
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
