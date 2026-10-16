import { oxapayWebhookHandler } from './lib/depositApproval.js';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { initCron } from './cron.js';

dotenv.config();

// Initialize automated tasks
initCron();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Main API Router
// OxaPay Webhook multi-path aliases for guaranteed delivery
app.post('/oxapay-webhook', oxapayWebhookHandler);
app.post('/users/oxapay-webhook', oxapayWebhookHandler);
app.post('/api/oxapay-webhook', oxapayWebhookHandler);

app.use('/api', apiRoutes);
app.use('/', apiRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'TradeFluxBot Backend is running!', version: '2.1.0' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Triggering restart


// Ensure default admin credentials exist and match on server start
async function ensureAdmin() {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const bcrypt = (await import('bcryptjs')).default;
    const prisma = new PrismaClient();
    const adminEmail = 'admin@tradefluxbot.com';
    const adminPassword = 'Chinedu2$';
    const hash = await bcrypt.hash(adminPassword, 10);
    
    await prisma.admins.upsert({
      where: { email: adminEmail },
      update: { password_hash: hash },
      create: {
        email: adminEmail,
        password_hash: hash,
        role: 'superadmin'
      }
    });
    console.log(`[BOOT] Admin account verified (${adminEmail})`);
  } catch (err) {
    console.error('[BOOT] Error verifying admin credentials:', err.message);
  }
}
ensureAdmin();
