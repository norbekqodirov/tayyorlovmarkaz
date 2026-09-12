/**
 * Bosqich 4 jonli tekshiruvi: PermissionOverride ALLOW/DENY va muddati
 * o'tgan override — server/middleware/authorize.ts'ning can()/
 * getEffectivePermissions()'i to'g'ridan-to'g'ri chaqiriladi (bu
 * yordamchi hali hech bir HTTP route'ga ulanmagan, shuning uchun
 * funksiya darajasida tekshiriladi — foydalanuvchi so'ragan asosiy
 * stsenariylardan biri, RBAC rejasi Bosqich 4).
 */
import { PrismaClient } from '@prisma/client';
import { can, getEffectivePermissions } from '../server/middleware/authorize.js';

const prisma = new PrismaClient();

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    const teacherRole = await prisma.role.findUnique({ where: { name: 'TEACHER' } });
    if (!teacherRole) throw new Error('TEACHER roli topilmadi');

    const user = await prisma.user.create({
        data: { name: 'Test Override User', phone: '+998900000801', password: 'x', role: 'TEACHER', roleId: teacherRole.id },
    });

    try {
        // Boshlang'ich holat: rol andozasi bo'yicha 'finance' YO'Q, 'journal' BOR
        const before = await can(user.id, 'TEACHER', 'finance');
        check("Boshlang'ich: 'finance' ruxsati yo'q (rolda yo'q)", before === false);
        const journalBefore = await can(user.id, 'TEACHER', 'journal');
        check("Boshlang'ich: 'journal' ruxsati bor (rolda bor)", journalBefore === true);

        // ALLOW override: rolda yo'q ruxsatni qo'shadi
        await prisma.permissionOverride.create({
            data: { userId: user.id, permissionKey: 'finance', effect: 'ALLOW', reason: 'Test ALLOW' },
        });
        const afterAllow = await can(user.id, 'TEACHER', 'finance');
        check("ALLOW override: 'finance' endi bor", afterAllow === true);

        // DENY override: rolda bor ruxsatni olib tashlaydi
        await prisma.permissionOverride.create({
            data: { userId: user.id, permissionKey: 'journal', effect: 'DENY', reason: 'Test DENY' },
        });
        const afterDeny = await can(user.id, 'TEACHER', 'journal');
        check("DENY override: 'journal' endi yo'q", afterDeny === false);

        // Muddati o'tgan ALLOW override — e'tiborsiz qoldirilishi kerak
        await prisma.permissionOverride.create({
            data: {
                userId: user.id, permissionKey: 'bi', effect: 'ALLOW', reason: 'Test EXPIRED',
                validUntil: new Date(Date.now() - 60_000), // 1 daqiqa oldin tugagan
            },
        });
        const expired = await can(user.id, 'TEACHER', 'bi');
        check("Muddati o'tgan ALLOW override e'tiborga olinmaydi", expired === false, expired);

        // Kelajakdagi validUntil bilan ALLOW override — hali kuchda
        await prisma.permissionOverride.create({
            data: {
                userId: user.id, permissionKey: 'goals', effect: 'ALLOW', reason: 'Test FUTURE',
                validUntil: new Date(Date.now() + 3_600_000),
            },
        });
        const stillValid = await can(user.id, 'TEACHER', 'goals');
        check('Hali tugamagan ALLOW override kuchda', stillValid === true, stillValid);

        // Yakuniy samarali ruxsatlar to'plami — kutilgan holatga mos
        const effective = await getEffectivePermissions(user.id, 'TEACHER');
        check("Yakuniy to'plamda 'finance' bor", effective.has('finance'));
        check("Yakuniy to'plamda 'journal' yo'q", !effective.has('journal'));
        check("Yakuniy to'plamda 'bi' yo'q (muddati o'tgan)", !effective.has('bi'));
        check("Yakuniy to'plamda 'goals' bor", effective.has('goals'));

        // ADMIN/SUPER_ADMIN — override'lardan qat'i nazar har doim TO'LIQ
        const adminEffective = await getEffectivePermissions(user.id, 'SUPER_ADMIN');
        const allPermCount = (await prisma.permission.count());
        check('SUPER_ADMIN uchun override e\'tiborga olinmaydi (to\'liq ruxsat)', adminEffective.size === allPermCount, adminEffective.size);
    } finally {
        await prisma.permissionOverride.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
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
