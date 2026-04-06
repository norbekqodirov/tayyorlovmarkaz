import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function reset() {
  try {
    const hashedPassword = await bcrypt.hash('Admin2026!', 10);
    await db.user.update({
      where: { email: 'admin@tayyorlovmarkaz.uz' },
      data: { password: hashedPassword }
    });
    console.log('Password reset successful');
  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    await db.$disconnect();
  }
}

reset();
