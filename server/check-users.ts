import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const users = await db.user.findMany({ select: { email: true, name: true, role: true } });
console.log(JSON.stringify(users, null, 2));
await db.$disconnect();
