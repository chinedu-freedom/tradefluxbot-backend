import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const logoPath = path.resolve('../tradefluxbot/public/logo.png');
  if (!fs.existsSync(logoPath)) {
    console.error(`Error: logo.png not found at ${logoPath}`);
    process.exit(1);
  }

  // 1. Convert logo.png to base64 Data URL
  const logoBuffer = fs.readFileSync(logoPath);
  const base64Logo = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  console.log("Updating database settings.platform_logo...");
  const settings = await prisma.settings.findFirst();
  if (settings) {
    await prisma.settings.update({
      where: { id: settings.id },
      data: { platform_logo: base64Logo }
    });
    console.log("Database platform_logo updated successfully!");
  } else {
    console.warn("No settings record found in database!");
  }

  // 2. Overwrite local user & admin frontend assets
  const targets = [
    '../tradefluxbot/public/favicon.ico',
    '../tradefluxbot/src/app/favicon.ico',
    '../tradefluxbot/src/app/icon.png',
    '../tradefluxbot/public/icon-192x192.png',
    '../tradefluxbot/public/icon-512x512.png',
    '../tradefluxbot-admin/public/logo.png',
    '../tradefluxbot-admin/public/favicon.ico',
    '../tradefluxbot-admin/src/app/favicon.ico',
    '../tradefluxbot-admin/src/app/icon.png',
    '../tradefluxbot-admin/public/icon-192x192.png',
    '../tradefluxbot-admin/public/icon-512x512.png',
    './public/logo.png'
  ];

  for (const target of targets) {
    const targetPath = path.resolve(target);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, logoBuffer);
    console.log(`Overwrote ${targetPath}`);
  }

  console.log("All logo updates completed successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
