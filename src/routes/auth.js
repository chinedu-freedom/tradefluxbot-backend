import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordResetConfirmationEmail, sendNewReferralNotificationEmail } from '../lib/mailer.js';
import { logActivity } from '../lib/logger.js';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// User Registration
router.post('/register', async (req, res) => {
  let { email, password, full_name, username, country_id, language_id, referred_by_code } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Missing required fields (email, password, full_name)' });
  }

  try {
    const existingUser = await prisma.users.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    if (username) {
      const existingUsername = await prisma.users.findFirst({ where: { username } });
      if (existingUsername) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    if (country_id) {
      const countryExists = await prisma.countries.findUnique({ where: { id: country_id } });
      if (!countryExists) {
        const defaultCountry = await prisma.countries.findFirst();
        country_id = defaultCountry ? defaultCountry.id : null;
      }
    } else {
      let defaultCountry = await prisma.countries.findFirst();
      if (!defaultCountry) {
        defaultCountry = await prisma.countries.create({
          data: {
            country_code: "US",
            country_name: "United States",
            currency_symbol: "$",
            currency_code: "USD",
            exchange_rate: 1.0,
            auto_update: false,
            status: true
          }
        });
      }
      country_id = defaultCountry.id;
    }

    if (!language_id) {
      let defaultLanguage = await prisma.languages.findFirst({ where: { is_default: true } })
        || await prisma.languages.findFirst();
      if (!defaultLanguage) {
        defaultLanguage = await prisma.languages.create({
          data: {
            language_code: "en",
            language_name: "English",
            native_name: "English",
            text_direction: "ltr",
            is_default: true,
            status: true
          }
        });
      }
      language_id = defaultLanguage.id;
    }

    const password_hash = await bcrypt.hash(password, 10);
    
    // Generate unique referral code (first 4 letters of name + random numbers)
    const prefix = full_name.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'EON');
    const referral_code = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;

    let referred_by_id = null;
    let referrer = null;
    if (referred_by_code) {
      referrer = await prisma.users.findUnique({ where: { referral_code: referred_by_code } });
      if (referrer) {
        referred_by_id = referrer.id;
      }
    }

    const settings = await prisma.settings.findFirst();
    const regBonus = settings ? Number(settings.registration_bonus || 0) : 0;
    const bonusDest = settings?.welcome_bonus_destination || 'deposit';

    const clientIp = (req.headers['x-forwarded-for'] 
      ? req.headers['x-forwarded-for'].split(',')[0].trim() 
      : req.socket.remoteAddress || req.ip) || 'Unknown';

    const user = await prisma.users.create({
      data: {
        email,
        password_hash,
        full_name,
        username,
        country_id,
        language_id,
        referral_code,
        referred_by: referred_by_id,
        last_login: new Date(),
        last_ip: clientIp,
        balance: 0,
        gift_balance: 0,
        withdrawable_balance: regBonus,
        email_verified: true
      }
    });

    if (regBonus > 0) {
      await prisma.transactions.create({
        data: {
          user_id: user.id,
          type: 'REGISTRATION_BONUS',
          amount: regBonus,
          balance_before: 0,
          balance_after: regBonus,
          description: 'Registration Welcome Bonus'
        }
      });
    }

    await logActivity(user.id, 'user registered', req);

    const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });

    // Send Welcome Email
    try {
      await sendWelcomeEmail({ email: user.email, name: user.full_name });
    } catch (err) {
      console.error("Failed to send welcome email:", err);
    }

    // Send Notification Email to the referrer (link owner)
    if (referrer && referrer.email) {
      try {
        await sendNewReferralNotificationEmail({
          referrerEmail: referrer.email,
          referrerName: referrer.full_name || referrer.username,
          newUserName: user.full_name,
          newUserUsername: user.username,
          newUserEmail: user.email
        });
        console.log(`[REFERRAL] Sent new referral notification email to referrer ${referrer.email} for new signup ${user.email}`);
      } catch (refEmailErr) {
        console.error("Failed to send new referral notification email to referrer:", refEmailErr);
      }
    }

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        balance: user.balance,
        withdrawable_balance: user.withdrawable_balance,
        email_verified: user.email_verified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Get Countries
router.get('/countries', async (req, res) => {
  try {
    const countries = await prisma.countries.findMany({
      orderBy: { country_name: 'asc' },
    });
    res.json({ success: true, data: countries });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

// Get Languages
router.get('/languages', async (req, res) => {
  try {
    const languages = await prisma.languages.findMany({
      where: { status: true },
      orderBy: { sort_order: 'asc' },
    });
    res.json({ success: true, data: languages });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch languages' });
  }
});

// User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const clientIp = (req.headers['x-forwarded-for'] 
      ? req.headers['x-forwarded-for'].split(',')[0].trim() 
      : req.socket.remoteAddress || req.ip) || 'Unknown';

    await prisma.users.update({
      where: { id: user.id },
      data: {
        last_login: new Date(),
        last_ip: clientIp
      }
    });

    await logActivity(user.id, 'user login', req);

    const { keepMeLoggedIn } = req.body;
    const expiresIn = keepMeLoggedIn ? '24h' : '1h';
    const token = jwt.sign({ id: user.id, email: user.email, role: 'user' }, JWT_SECRET, { expiresIn });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        balance: user.balance,
        withdrawable_balance: user.withdrawable_balance,
        email_verified: user.email_verified
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// In-memory rate limiting for admin login to prevent brute force
const adminLoginAttempts = new Map();

function checkAdminRateLimit(ip) {
  const now = Date.now();
  const record = adminLoginAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: 0 };

  if (record.blockedUntil > now) {
    const waitMins = Math.ceil((record.blockedUntil - now) / 60000);
    return { blocked: true, message: `Too many failed admin login attempts. Access temporarily locked for ${waitMins} minute(s).` };
  }

  // Reset window after 15 minutes of inactivity
  if (now - record.firstAttempt > 15 * 60 * 1000) {
    record.count = 0;
    record.firstAttempt = now;
  }

  return { blocked: false, record };
}

function recordAdminFailedAttempt(ip, record) {
  record.count += 1;
  if (record.count >= 5) {
    record.blockedUntil = Date.now() + 15 * 60 * 1000; // Lockout for 15 minutes
  }
  adminLoginAttempts.set(ip, record);
}

// Admin Login
router.post('/admin/login', async (req, res) => {
  const rawEmail = (req.body.email || '').toString().trim().toLowerCase();
  const rawPassword = (req.body.password || '').toString().trim();

  const clientIp = (req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim() 
    : req.socket.remoteAddress || req.ip) || 'Unknown';

  const rateCheck = checkAdminRateLimit(clientIp);
  if (rateCheck.blocked) {
    return res.status(429).json({ error: rateCheck.message });
  }

  // Strictly enforce that only the sole authorized admin email can log in
  if (rawEmail !== 'admin@tradefluxbot.com') {
    recordAdminFailedAttempt(clientIp, rateCheck.record);
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  try {
    const admin = await prisma.admins.findUnique({ where: { email: rawEmail } });
    if (!admin) {
      recordAdminFailedAttempt(clientIp, rateCheck.record);
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const isValid = await bcrypt.compare(rawPassword, admin.password_hash);
    if (!isValid) {
      recordAdminFailedAttempt(clientIp, rateCheck.record);
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    // Login succeeded: reset failed attempts
    adminLoginAttempts.delete(clientIp);

    const { keepMeLoggedIn } = req.body;
    const expiresIn = keepMeLoggedIn ? '24h' : '1h';
    const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin' }, JWT_SECRET, { expiresIn });

    res.json({
      message: 'Admin login successful',
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Admin login failed', details: error.message });
  }
});

// Admin Registration is strictly prohibited
router.all([
  '/admin/register',
  '/admin/signup',
  '/admin/create',
  '/register/admin',
  '/signup/admin'
], (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Admin registration is strictly prohibited.'
  });
});

// Password reset endpoints disabled for security
router.all([
  '/forgot-password',
  '/verify-otp',
  '/reset-password',
  '/admin/forgot-password',
  '/admin/verify-otp',
  '/admin/reset-password'
], (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Password reset via website is disabled for security reasons. Please contact platform support.'
  });
});

export default router;
