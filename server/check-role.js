import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
db.user.findUnique({where: {email: 'admin@tayyorlovmarkaz.uz'}}).then(u => {
    console.log(u);
}).finally(() => db.$disconnect());
