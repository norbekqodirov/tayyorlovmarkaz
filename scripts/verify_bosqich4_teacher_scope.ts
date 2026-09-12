/**
 * Bosqich 4 jonli tekshiruvi: TEACHER faqat o'z guruhi/o'quvchilarini
 * ko'radi (crud.ts'dagi TEACHER_SCOPE_MODELS naqshi). Bu naqsh avvalroq
 * shu sessiyada qurilgan edi — bu skript uni doimiy, qayta ishga
 * tushiriladigan tekshiruv sifatida rasmiylashtiradi (foydalanuvchi
 * so'ragan asosiy stsenariylardan biri, RBAC rejasi Bosqich 4).
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
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    const teacherA = await prisma.user.create({ data: { name: 'Test Teacher A', phone: '+998900000701', password: 'x', role: 'TEACHER' } });
    const teacherB = await prisma.user.create({ data: { name: 'Test Teacher B', phone: '+998900000702', password: 'x', role: 'TEACHER' } });
    const course = await prisma.course.create({ data: { name: 'Test Kurs (Bosqich 4)' } });
    const groupA = await prisma.group.create({ data: { name: 'Guruh A', courseId: course.id, teacherId: teacherA.id } });
    const groupB = await prisma.group.create({ data: { name: 'Guruh B', courseId: course.id, teacherId: teacherB.id } });
    const studentA = await prisma.student.create({ data: { name: "O'quvchi A" } });
    const studentB = await prisma.student.create({ data: { name: "O'quvchi B" } });
    await prisma.enrollment.create({ data: { studentId: studentA.id, groupId: groupA.id } });
    await prisma.enrollment.create({ data: { studentId: studentB.id, groupId: groupB.id } });

    const tokenA = mint(teacherA.id, 'TEACHER', teacherA.phone!);

    try {
        const groups = await req('/groups', tokenA);
        const groupIds = (groups.json?.data ?? groups.json ?? []).map((g: any) => g.id);
        check("TEACHER A ro'yxatida o'z guruhi bor", groupIds.includes(groupA.id), groupIds);
        check("TEACHER A ro'yxatida begona guruh YO'Q", !groupIds.includes(groupB.id), groupIds);

        const students = await req('/students', tokenA);
        const studentIds = (students.json?.data ?? students.json ?? []).map((s: any) => s.id);
        check("TEACHER A ro'yxatida o'z o'quvchisi bor", studentIds.includes(studentA.id), studentIds);
        check("TEACHER A ro'yxatida begona o'quvchi YO'Q", !studentIds.includes(studentB.id), studentIds);

        const groupBDirect = await req(`/groups/${groupB.id}`, tokenA);
        check('TEACHER A begona guruhni ID orqali ochsa 403/404', [403, 404].includes(groupBDirect.status), groupBDirect.status);
    } finally {
        await prisma.enrollment.deleteMany({ where: { groupId: { in: [groupA.id, groupB.id] } } });
        await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentB.id] } } });
        await prisma.group.deleteMany({ where: { id: { in: [groupA.id, groupB.id] } } });
        await prisma.course.delete({ where: { id: course.id } });
        await prisma.user.deleteMany({ where: { id: { in: [teacherA.id, teacherB.id] } } });
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
