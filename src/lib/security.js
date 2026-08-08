import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, 'security-config.json');

const DEFAULT_PASSWORD = 'Kr!ptex@77$$';

export function getSecurityPassword() {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.password || DEFAULT_PASSWORD;
    }
  } catch (error) {
    console.error('Error reading security password:', error);
  }
  return DEFAULT_PASSWORD;
}

export function setSecurityPassword(newPassword) {
  try {
    const data = JSON.stringify({ password: newPassword }, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing security password:', error);
    return false;
  }
}
