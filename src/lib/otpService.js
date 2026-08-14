/**
 * In-memory OTP Security Service for 2-Step Verification
 * Supports cooldowns, expiration, and one-time consumption.
 */

const otpStore = new Map(); // Key: `${userId}:${purpose}` -> { code, expiresAt, lastSentAt, metadata }

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000;  // 60 seconds

export function generateSecurityOtp(userId, purpose, metadata = {}) {
  const key = `${userId}:${purpose}`;
  const now = Date.now();
  const existing = otpStore.get(key);

  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    return {
      success: false,
      cooldown: true,
      remainingSeconds,
      message: `Please wait ${remainingSeconds}s before requesting a new code.`
    };
  }

  // Generate a secure 6-digit numeric OTP code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = now + OTP_EXPIRY_MS;

  otpStore.set(key, {
    code,
    expiresAt,
    lastSentAt: now,
    metadata
  });

  return {
    success: true,
    code,
    expiresAt
  };
}

export function verifySecurityOtp(userId, purpose, code, consume = true) {
  const key = `${userId}:${purpose}`;
  const record = otpStore.get(key);

  if (!record) {
    return {
      valid: false,
      message: 'No active verification code found. Please request a new code.'
    };
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    return {
      valid: false,
      message: 'Verification code has expired. Please request a new one.'
    };
  }

  if (record.code !== String(code).trim()) {
    return {
      valid: false,
      message: 'Invalid verification code.'
    };
  }

  if (consume) {
    otpStore.delete(key);
  }

  return {
    valid: true,
    metadata: record.metadata
  };
}

export function clearSecurityOtp(userId, purpose) {
  const key = `${userId}:${purpose}`;
  otpStore.delete(key);
}
