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
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'TradeFluxBot Backend is running!' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Triggering restart
