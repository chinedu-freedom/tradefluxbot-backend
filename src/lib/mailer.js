import { PrismaClient } from "@prisma/client";
import { emailTemplate } from "./template.js";
import { sendEmail } from "./zohoMailer.js";

const prisma = new PrismaClient();

async function getSiteName() {
  try {
    const settings = await prisma.settings.findFirst();
    return settings?.site_name || "Kryptex Mining";
  } catch (error) {
    return "Kryptex Mining";
  }
}

async function getCurrencySymbol() {
  try {
    const settings = await prisma.settings.findFirst();
    return settings?.currency_symbol || "$";
  } catch (error) {
    return "$";
  }
}

// Verification Email
export async function sendVerificationEmail({ email, name, code }) {
  const siteName = await getSiteName();
  const subject = `Verify Your Email - ${siteName}`;

  const content = `
    <div style="text-align:center; padding:10px 0;">
      <h2 style="color:#0f172a; margin-bottom:10px;">Verify Your Email Address</h2>
      <p style="color:#475569; font-size:16px; line-height:1.6; margin-bottom: 24px;">
        Hi ${name},<br><br>
        To complete your profile and unlock full access to investing, deposits, and withdrawals, please use the verification code below:
      </p>
      <div style="margin:30px 0;">
        <span style="background:#f1f5f9; color:#4c1d95; padding:16px 32px; border-radius:8px; font-size:28px; font-weight:bold; letter-spacing: 8px; display:inline-block; border: 1px dashed #cbd5e1;">
          ${code}
        </span>
      </div>
      <p style="font-size:14px; color:#64748b; margin-top:20px;">
        This code will expire in <strong>10 minutes</strong>.
      </p>
      <p style="font-size:13px; color:#94a3b8; margin-top:30px;">
        If you did not request this verification, you can safely ignore this email.
      </p>
    </div>
  `;

  return await sendEmail({ to: email, subject, html: emailTemplate(content, siteName) });
}

export async function sendWelcomeEmail({ email, name }) {
  const siteName = await getSiteName();
  const subject = `Welcome to ${siteName} - Let's Start Growing!`;

  const content = `
    <div style="text-align:center; padding:10px 0;">
      <h2 style="color:#4c1d95; margin-bottom:15px; font-size: 24px; font-weight: 800;">
        Welcome Aboard, ${name}! 🚀
      </h2>

      <p style="color:#4b5563; font-size:16px; line-height:1.7; margin-bottom: 25px;">
        We're thrilled to have you join <strong>${siteName}</strong>. You've just taken a major step toward optimizing your digital infrastructure and maximizing your computing power potential.
      </p>

      <div style="background: #f5f3ff; border-radius: 16px; padding: 25px; margin: 30px 0; border: 1px solid #ede9fe; text-align: left;">
        <h3 style="color:#6d28d9; margin-top:0; font-size: 18px;">What's Next?</h3>
        <ul style="color:#4b5563; font-size:14px; padding-left: 20px; margin-bottom: 0;">
          <li style="margin-bottom: 10px;"><strong>Explore Staking Plans:</strong> Choose from our highly optimized computing power plans.</li>
          <li style="margin-bottom: 10px;"><strong>Set Up Your Wallet:</strong> Connect your crypto wallet to start earning profits.</li>
          <li><strong>Invite Friends:</strong> Share the future of computing and earn referral rewards.</li>
        </ul>
      </div>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
        Our team is here to support you 24/7. If you have any questions, simply reply to this email or reach out via our Help Line.
      </p>
      
      <p style="margin-top: 30px; font-weight: 700; color: #4c1d95;">
        Happy Investing,<br>
        The ${siteName} Team
      </p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject,
    html: emailTemplate(content, siteName)
  });
}

export async function sendPasswordResetEmail(email, name, otp) {
  const siteName = await getSiteName();
  const subject = `Your OTP Code - ${siteName}`;

  const content = `
    <p>Hi <strong>${name}</strong>,</p>

    <p>
      You recently requested to reset your password for your
      <strong>${siteName}</strong> account. Please use the OTP code below
      to complete the process:
    </p>

    <div style="margin:24px 0; text-align:center;">
      <span style="
        background: #f5f3ff;
        color: #6d28d9;
        padding: 12px 35px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 8px;
        border: 2px dashed #6d28d9;
        border-radius: 12px;
        display: inline-block;
      ">
        ${otp}
      </span>
    </div>

    <p>
      This OTP is valid for <strong>10 minutes</strong>.
      For your security, do not share this code with anyone.
    </p>

    <p style="font-size:13px; color:#666;">
      If you didn’t request a password reset, you can safely ignore this email.
      Your account will remain secure.
    </p>
  `;

  return await sendEmail({
    to: email,
    subject,
    html: emailTemplate(content, siteName),
  });
}

export async function sendPasswordChangeConfirmationEmail(email, name) {
  const siteName = await getSiteName();
  const subject = `Your Password Has Been Updated - ${siteName}`;

  const content = `
    <div style="padding:30px 0; text-align:center;">
      <p style="font-size:16px; color:#333; margin-bottom:16px;">
        Hi <strong>${name}</strong>,
      </p>

      <p style="font-size:15px; color:#555; line-height:1.6; margin-bottom:20px;">
        Your password has been <strong>successfully changed</strong>.
      </p>

      <p style="font-size:15px; color:#555; line-height:1.6; margin-bottom:24px;">
        If you did not perform this action, please contact our support team
        <a href="mailto:support@${siteName.toLowerCase().replace(/\s+/g, "")}.com"
           style="color:#6d28d9; font-weight:bold; text-decoration:none;">
          immediately
        </a>.
      </p>

      <p style="font-size:13px; color:#888; margin-top:20px;">
        If this was you, no further action is required.
      </p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject,
    html: emailTemplate(content, siteName),
  });
}

export async function sendPasswordResetConfirmationEmail(email, name) {
  const siteName = await getSiteName();
  const subject = `Your Password Has Been Reset - ${siteName}`;

  const content = `
    <div style="padding:30px 0; text-align:center;">
      <p style="font-size:16px; color:#333; margin-bottom:16px;">
        Hi <strong>${name}</strong>,
      </p>

      <p style="font-size:15px; color:#555; line-height:1.6; margin-bottom:20px;">
        Your password has been <strong>successfully reset</strong>.
      </p>

      <p style="font-size:15px; color:#555; line-height:1.6; margin-bottom:24px;">
        If you did not perform this action, please contact our support team
        <a href="mailto:support@${siteName.toLowerCase().replace(/\s+/g, "")}.com"
           style="color:#6d28d9; font-weight:bold; text-decoration:none;">
          immediately
        </a>.
      </p>

      <p style="font-size:13px; color:#888; margin-top:20px;">
        If this was you, no further action is required.
      </p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject,
    html: emailTemplate(content, siteName),
  });
}

export async function sendDepositNotificationEmail({ email, name, crypto, amount, status, date, isAdmin = false, userName, userEmail }) {
  const siteName = await getSiteName();
  const symbol = await getCurrencySymbol();

  // If sending to user, check if this specific status notification is enabled
  if (!isAdmin) {
    try {
      const emailSettings = await prisma.email_settings.findFirst();
      if (emailSettings) {
        const lowerStatus = (status || "").toLowerCase();
        if ((lowerStatus === "pending" || lowerStatus === "processing") && !emailSettings.notify_deposit_processing) {
          console.log(`Skipping deposit processing email to ${email} as disabled in settings.`);
          return;
        }
        if ((lowerStatus === "approved" || lowerStatus === "success") && !emailSettings.notify_deposit_approved) {
          console.log(`Skipping deposit approved email to ${email} as disabled in settings.`);
          return;
        }
        if ((lowerStatus === "rejected" || lowerStatus === "failed") && !emailSettings.notify_deposit_rejected) {
          console.log(`Skipping deposit rejected email to ${email} as disabled in settings.`);
          return;
        }
      }
    } catch (err) {
      console.error("Error checking email settings for deposit notification:", err);
    }
  }

  const lowerStatus = (status || "").toLowerCase();
  const isApproved = lowerStatus === "approved" || lowerStatus === "success";
  const isRejected = lowerStatus === "rejected" || lowerStatus === "failed";

  const subject = isAdmin ? "New Deposit Request - Action Required" : `Deposit ${isApproved ? 'Successful' : (isRejected ? 'Rejected' : 'Request Received')} - ${siteName}`;
  
  const heading = isAdmin 
    ? "" 
    : `<h2 style="color:#0b132b; margin-bottom:12px; text-align:center;">Deposit ${isApproved ? 'Successful' : (isRejected ? 'Rejected' : 'Pending')}</h2>`;

  const userMessage = isApproved
    ? `<p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 12px;">
        Great news! Your deposit of <strong>${symbol}${amount}</strong> has been successfully approved and credited to your account balance.
      </p>`
    : isRejected
    ? `<p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 12px;">
        Unfortunately, your deposit request of <strong>${symbol}${amount}</strong> has been rejected. Please contact support if you believe this was an error.
      </p>`
    : `<p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 12px;">
        Your deposit request of <strong>${symbol}${amount}</strong> has been received successfully. You will be notified once your deposit has been confirmed on our end, and it will be automatically credited to your account.
      </p>`;

  const message = isAdmin
    ? `<p style="font-size: 15px; color: #333;">A new deposit has been submitted by <strong>${userName}</strong> || <a href="mailto:${userEmail}">${userEmail}</a> </p>
    <p style="font-size: 15px; color: #333;">Please review and verify the transaction in the admin dashboard.</p>`
    : `${userMessage}
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 24px;">
        Thank you for choosing ${siteName}.
      </p>
    `;
 
  const content = `
    <div style="padding: 10px 0;">
      ${heading}
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 12px;">
        Hi <strong>${name}</strong>,
      </p>
      ${message}
    </div>
    <table style="width:100%; border-collapse: collapse; margin:20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <tr style="background-color:#f0f4f8;"><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Crypto</td><td style="padding:12px; border:1px solid #e5e7eb;">${crypto}</td></tr>
      <tr><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Amount</td><td style="padding:12px; border:1px solid #e5e7eb;">${symbol}${amount}</td></tr>
      <tr style="background-color:#f0f4f8;"><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Status</td><td style="padding:12px; border:1px solid #e5e7eb; color: #6d28d9; font-weight: 700;">${status.charAt(0).toUpperCase() + status.slice(1)}</td></tr>
      <tr><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Date</td><td style="padding:12px; border:1px solid #e5e7eb;">${new Date(date).toLocaleString()}</td></tr>
    </table>
    `;
  return await sendEmail({ to: email, subject, html: emailTemplate(content, siteName) });
}

export async function sendWithdrawalNotificationEmail({ email, name, crypto, amount, walletAddress, status, date, isAdmin = false, userName, userEmail }) {
  const siteName = await getSiteName();
  const symbol = await getCurrencySymbol();

  // If sending to user, check if this specific status notification is enabled
  if (!isAdmin) {
    try {
      const emailSettings = await prisma.email_settings.findFirst();
      if (emailSettings) {
        const lowerStatus = (status || "").toLowerCase();
        if ((lowerStatus === "pending" || lowerStatus === "processing") && !emailSettings.notify_withdrawal_processing) {
          console.log(`Skipping withdrawal processing email to ${email} as disabled in settings.`);
          return;
        }
        if ((lowerStatus === "approved" || lowerStatus === "success") && !emailSettings.notify_withdrawal_approved) {
          console.log(`Skipping withdrawal approved email to ${email} as disabled in settings.`);
          return;
        }
        if ((lowerStatus === "rejected" || lowerStatus === "failed") && !emailSettings.notify_withdrawal_rejected) {
          console.log(`Skipping withdrawal rejected email to ${email} as disabled in settings.`);
          return;
        }
      }
    } catch (err) {
      console.error("Error checking email settings for withdrawal notification:", err);
    }
  }

  const lowerStatus = (status || "").toLowerCase();
  const isApproved = lowerStatus === "approved" || lowerStatus === "success" || lowerStatus === "paid";
  const isRejected = lowerStatus === "rejected" || lowerStatus === "failed";

  const subject = isAdmin ? "New Withdrawal Request - Action Required" : `Withdrawal ${isApproved ? 'Successful' : (isRejected ? 'Rejected' : 'Request Received')} - ${siteName}`;
  
  const userMessage = isApproved
    ? `<p style="font-size: 15px; color: #555;">Great news! Your <strong>${crypto}</strong> withdrawal request of <strong>${symbol}${amount}</strong> to wallet <strong>${walletAddress}</strong> has been successfully processed.</p>
       <p style="font-size: 15px; color: #555;">The funds should arrive in your wallet shortly.</p>`
    : isRejected
    ? `<p style="font-size: 15px; color: #555;">Unfortunately, your <strong>${crypto}</strong> withdrawal request of <strong>${symbol}${amount}</strong> to wallet <strong>${walletAddress}</strong> has been rejected.</p>
       <p style="font-size: 15px; color: #555;">Please contact support if you need further assistance.</p>`
    : `<p style="font-size: 15px; color: #555;">Your <strong>${crypto}</strong> withdrawal request of <strong>${symbol}${amount}</strong> to wallet <strong>${walletAddress}</strong> is currently <strong>${status}</strong>.</p>
       <p style="font-size: 15px; color: #555;">Once our team reviews and processes your request, you will receive a confirmation email.</p>`;

  const message = isAdmin
    ? `<p  style="font-size: 15px; color: #333;">A new withdrawal has been submitted by <strong>${userName}</strong>  <a href="mailto:${userEmail}">${userEmail}</a>
    </p><p  style="font-size: 15px; color: #333;">Please review and process this request in the admin dashboard.</p>`
    : userMessage;

  const content = `
       <p style="font-size: 16px; color: #333333; margin-bottom: 15px;">
        Hi <strong>${name}</strong>,
      </p>

    ${message}
    <table style="width:100%; border-collapse: collapse; margin:20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <tr style="background-color:#f0f4f8;"><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Crypto</td><td style="padding:12px; border:1px solid #e5e7eb;">${crypto}</td></tr>
      <tr><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Amount</td><td style="padding:12px; border:1px solid #e5e7eb;">${symbol}${amount}</td></tr>
      <tr style="background-color:#f0f4f8;"><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Wallet Address</td><td style="padding:12px; border:1px solid #e5e7eb; word-break: break-word; font-size: 13px;">${walletAddress}</td></tr>
      <tr><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Status</td><td style="padding:12px; border:1px solid #e5e7eb; color: #6d28d9; font-weight: 700;">${status.charAt(0).toUpperCase() + status.slice(1)}</td></tr>
      <tr style="background-color:#f0f4f8;"><td style="padding:12px; border:1px solid #e5e7eb; font-weight: 600;">Date</td><td style="padding:12px; border:1px solid #e5e7eb;">${new Date(date).toLocaleString()}</td></tr>
    </table>
  `;
  return await sendEmail({ to: email, subject, html: emailTemplate(content, siteName) });
}

export async function sendWithdrawalOtpEmail({ email, name, amount, currencySymbol, network, address, code }) {
  const siteName = await getSiteName();
  const symbol = currencySymbol || (await getCurrencySymbol());
  const subject = `Security Verification: Withdrawal Request - ${siteName}`;

  const content = `
    <div style="text-align:center; padding:10px 0;">
      <h2 style="color:#0f172a; margin-bottom:10px;">Withdrawal Verification Code</h2>
      <p style="color:#475569; font-size:15px; line-height:1.6; margin-bottom: 20px;">
        Hi <strong>${name || 'User'}</strong>,<br>
        A request has been initiated to withdraw <strong>${symbol}${amount}</strong> (${network}) to the following linked wallet address:
      </p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin: 15px 0; text-align: left; word-break: break-all; font-family: monospace; font-size: 13px; color: #334155;">
        <strong>Destination:</strong> ${address}
      </div>

      <p style="color:#475569; font-size:14px; margin-bottom: 12px;">
        Please use the 6-digit confirmation code below to authorize this withdrawal:
      </p>

      <div style="margin:24px 0; text-align:center;">
        <span style="
          background: #f5f3ff;
          color: #6d28d9;
          padding: 14px 35px;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 8px;
          border: 2px dashed #6d28d9;
          border-radius: 12px;
          display: inline-block;
        ">
          ${code}
        </span>
      </div>

      <p style="font-size:14px; color:#64748b; margin-top:16px;">
        This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.
      </p>
      <p style="font-size:12px; color:#94a3b8; margin-top:24px;">
        If you did not authorize this withdrawal request, please change your password immediately and contact support.
      </p>
    </div>
  `;

  return await sendEmail({ to: email, subject, html: emailTemplate(content, siteName) });
}

export async function sendWalletLinkOtpEmail({ email, name, symbol, network, address, code }) {
  const siteName = await getSiteName();
  const subject = `Security Verification: Link Wallet Address - ${siteName}`;

  const content = `
    <div style="text-align:center; padding:10px 0;">
      <h2 style="color:#0f172a; margin-bottom:10px;">Link Wallet Address Verification</h2>
      <p style="color:#475569; font-size:15px; line-height:1.6; margin-bottom: 20px;">
        Hi <strong>${name || 'User'}</strong>,<br>
        A request has been made to link a new <strong>${symbol} (${network})</strong> payout wallet address to your account:
      </p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin: 15px 0; text-align: left; word-break: break-all; font-family: monospace; font-size: 13px; color: #334155;">
        <strong>Address:</strong> ${address}
      </div>

      <p style="color:#475569; font-size:14px; margin-bottom: 12px;">
        Please enter the 6-digit confirmation code below to authorize linking this wallet:
      </p>

      <div style="margin:24px 0; text-align:center;">
        <span style="
          background: #f5f3ff;
          color: #6d28d9;
          padding: 14px 35px;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 8px;
          border: 2px dashed #6d28d9;
          border-radius: 12px;
          display: inline-block;
        ">
          ${code}
        </span>
      </div>

      <p style="font-size:14px; color:#64748b; margin-top:16px;">
        This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
      </p>
      <p style="font-size:12px; color:#94a3b8; margin-top:24px;">
        If you did not request to link this wallet, please secure your account immediately.
      </p>
    </div>
  `;

  return await sendEmail({ to: email, subject, html: emailTemplate(content, siteName) });
}

