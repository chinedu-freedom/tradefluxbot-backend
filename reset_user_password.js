import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const input = (process.argv[2] || 'Page20410@gmail.com').trim();
  const newPassword = process.argv[3] || 'Pumeza@2026!';

  console.log(`Resetting password for user: ${input}...`);

  let user = await prisma.users.findFirst({
    where: {
      email: { equals: input, mode: 'insensitive' }
    }
  });

  if (!user) {
    user = await prisma.users.findFirst({
      where: {
        OR: [
          { email: input },
          { email: input.toLowerCase() },
          { username: { equals: input, mode: 'insensitive' } }
        ]
      }
    });
  }

  if (!user) {
    console.error(`Error: User with email/username "${input}" not found!`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update password and clear any pending password reset records
  await prisma.$transaction([
    prisma.users.update({
      where: { id: user.id },
      data: { password_hash: passwordHash }
    }),
    prisma.password_resets.deleteMany({
      where: { user_id: user.id }
    })
  ]);

  console.log('--------------------------------------------------');
  console.log('✓ User password reset successfully!');
  console.log(`- User ID: ${user.id}`);
  console.log(`- Full Name: ${user.full_name}`);
  console.log(`- Email: ${user.email}`);
  console.log(`- New Password: ${newPassword}`);
  console.log('--------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('Failed to reset user password:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

