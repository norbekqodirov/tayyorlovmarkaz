/**
 * Bosqich 4 jonli tekshiruvi: requireAuth'ning JWT-eskirish tuzatishi —
 * endi har so'rovda (qisqa TTL bilan keshlangan holda) role/isActive
 * bazadan tasdiqlanadi, JWT payload'ga ko'r-ko'rona ishonilmaydi.
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../server/config/jwtSecret.js';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

function mint(id: string, role: string, phone: string) {
    return jwt.sign({ id, role, phone }, JWT_SECRET, { expiresIn: '1h' });
}

async function req(path: string, token: string) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.status;
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    // leads.ts endi requirePermission('leads') ham talab qiladi — test
    // foydalanuvchisi haqiqiy MANAGER Role'ga (roleId) bog'lanishi shart.
    const managerRole = await prisma.role.findUnique({ where: { name: 'MANAGER' } });
    if (!managerRole) throw new Error('MANAGER roli topilmadi');

    const u1 = await prisma.user.create({
        data: { name: 'Test Staleness User', phone: '+998900000501', password: 'x', role: 'MANAGER', roleId: managerRole.id, isActive: true },
    });
    // JWT payload TEACHER deb "yolg'on" ko'rsatadi (real DB'da MANAGER) —
    // requireAuth endi bazadan haqiqiy rolni olishi va MANAGER darajasiga
    // ruxsat berishi kerak (payload emas, DB manba).
    const tokenClaimsTeacher = mint(u1.id, 'TEACHER', u1.phone!);

    try {
        // Yangi (sovuq keshli) foydalanuvchi — birinchi so'rov bazadan
        // haqiqiy MANAGER rolini olishi kerak, JWT'dagi soxta TEACHER emas.
        const statusAsManager = await req('/leads', tokenClaimsTeacher);
        check('Cold cache: DB roli (MANAGER) ishlatiladi, /leads 200', statusAsManager === 200, statusAsManager);

        // Foydalanuvchini bloklaymiz (isActive=false)
        await prisma.user.update({ where: { id: u1.id }, data: { isActive: false } });

        // Bir xil eski JWT, lekin YANGI foydalanuvchi uchun kesh hali yo'q
        // edi — shuning uchun bu so'rov ham sovuq kesh bo'lib, darhol
        // bloklanishi kerak (avvalgi xulq-atvorda 30 kungacha bloklanmasdi).
        // (Eslatma: agar oldingi so'rov keshni to'ldirgan bo'lsa, bu holat
        // TTL ichida eski holatni ko'rsatishi mumkin edi — shuning uchun
        // real production'da TTL bor, lekin BU aniq test yangi foydalanuvchi
        // bilan ishlagani uchun muammo yo'q: kesh faqat 1-so'rovda to'ldi,
        // isActive o'zgarishidan OLDIN — shuning uchun quyidagi tekshiruv
        // TTL ichida ekanini bilib turib, alohida yangi foydalanuvchi bilan
        // qayta tekshiramiz.)
        const u2 = await prisma.user.create({
            data: { name: 'Test Staleness User 2', phone: '+998900000502', password: 'x', role: 'MANAGER', isActive: false },
        });
        const token2 = mint(u2.id, 'MANAGER', u2.phone!);
        const statusBlocked = await req('/leads', token2);
        check('Bloklangan foydalanuvchi (sovuq kesh) — darhol 403', statusBlocked === 403, statusBlocked);

        // Noma'lum (o'chirilgan) foydalanuvchi ID'si bilan JWT
        const fakeToken = mint('00000000-0000-0000-0000-000000000000', 'ADMIN', '+998900000000');
        const statusUnknown = await req('/leads', fakeToken);
        check('Mavjud bo\'lmagan foydalanuvchi — 401', statusUnknown === 401, statusUnknown);

        await prisma.user.delete({ where: { id: u2.id } });
    } finally {
        await prisma.user.delete({ where: { id: u1.id } }).catch(() => {});
        await prisma.$disconnect();
    }

    console.log(`\n${pass} PASS, ${fail} FAIL`);
    if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
