import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const router = Router();
const prisma = new PrismaClient();

// Get profile
router.get('/', async (req, res) => {
  try {
    const admin = await prisma.admins.findUnique({
      where: { id: req.user.id }
    });

    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    res.json({
      success: true,
      data: {
        username: admin.username || '',
        email: admin.email || '',
        dateOfBirth: admin.date_of_birth || '',
        city: admin.city || '',
        postalCode: admin.postal_code || '',
        image: admin.profile_image || null
      }
    });
  } catch (error) {
    console.error('Fetch admin profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admin profile' });
  }
});

// Update profile
router.patch('/', async (req, res) => {
  try {
    const { username, email, dateOfBirth, city, postalCode, image } = req.body;

    if (email) {
      if (email.toLowerCase().trim() !== 'admin@tradefluxbot.com') {
        return res.status(403).json({ success: false, message: 'Primary admin email is locked and cannot be changed.' });
      }
      const existing = await prisma.admins.findFirst({
        where: {
          email,
          id: { not: req.user.id }
        }
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email is already in use by another admin' });
      }
    }

    const updated = await prisma.admins.update({
      where: { id: req.user.id },
      data: {
        ...(username !== undefined && { username }),
        ...(email !== undefined && { email }),
        ...(dateOfBirth !== undefined && { date_of_birth: dateOfBirth ? new Date(dateOfBirth) : null }),
        ...(city !== undefined && { city }),
        ...(postalCode !== undefined && { postal_code: postalCode }),
        ...(image !== undefined && { profile_image: image })
      }
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        username: updated.username || '',
        email: updated.email || '',
        dateOfBirth: updated.date_of_birth || '',
        city: updated.city || '',
        postalCode: updated.postal_code || '',
        image: updated.profile_image || null
      }
    });
  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update admin profile' });
  }
});

// Change Password
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }

    const admin = await prisma.admins.findUnique({
      where: { id: req.user.id }
    });

    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid current password' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    await prisma.admins.update({
      where: { id: req.user.id },
      data: { password_hash }
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
});

export default router;
