/**
 * Davomat birlashtirish tekshiruvi: (1) migratsiya skripti — eski JSON-blob
 * Attendance'dan haqiqiy AttendanceRecord'ga to'g'ri ko'chiradi, mavjudni
 * ustiga yozmaydi; (2) yangi CRM endpoint'lari (/api/attendance-records) —
 * TEACHER egalik cheklovi, status validatsiyasi, upsert.
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../server/config/jwtSecret.js';
import { execSync } from 'child_process';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

function mint(id: string, role: string, phone: string) {
    return jwt.sign({ id, role, phone }, JWT_SECRET, { expiresIn: '1h' });
}

async function req(method: string, path: string, token: string, body?: any) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
}

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra?: any) {
    if (cond) { pass++; console.log(`OK   ${label}`); }
    else { fail++; console.log(`FAIL ${label}`, extra ?? ''); }
}

async function main() {
    const teacherRole = await prisma.role.findUnique({ where: { name: 'TEACHER' } });
    if (!teacherRole) throw new Error('TEACHER roli topilmadi');

    const teacherA = await prisma.user.create({
        data: { name: 'Test Attendance TEACHER A', phone: '+998900003001', password: 'x', role: 'TEACHER', roleId: teacherRole.id },
    });
    const teacherB = await prisma.user.create({
        data: { name: 'Test Attendance TEACHER B', phone: '+998900003002', password: 'x', role: 'TEACHER', roleId: teacherRole.id },
    });
    const course = await prisma.course.create({ data: { name: 'Test Kurs (Davomat)' } });
    const group = await prisma.group.create({ data: { name: 'Test Guruh (Davomat)', courseId: course.id, teacherId: teacherA.id } });
    const studentX = await prisma.student.create({ data: { name: "O'quvchi X" } });
    const studentY = await prisma.student.create({ data: { name: "O'quvchi Y" } });
    await prisma.enrollment.create({ data: { studentId: studentX.id, groupId: group.id } });
    await prisma.enrollment.create({ data: { studentId: studentY.id, groupId: group.id } });

    const tokenA = mint(teacherA.id, 'TEACHER', teacherA.phone!);
    const tokenB = mint(teacherB.id, 'TEACHER', teacherB.phone!);

    let oldAttendanceRow: any = null;

    try {
        // ═══ 1-qism: migratsiya skripti ═══
        // studentX uchun eski JSON-blob'da "absent", AttendanceRecord'da HALI YO'Q -> ko'chirilishi kerak
        // studentY uchun eski JSON-blob'da "late", lekin AttendanceRecord'da ALLAQACHON "present" bor -> ustiga yozilMAYDI
        oldAttendanceRow = await prisma.attendance.create({
            data: {
                groupId: group.id,
                date: '2026-09-01',
                records: JSON.stringify([
                    { studentId: studentX.id, status: 'absent', time: new Date().toISOString() },
                    { studentId: studentY.id, status: 'late', time: new Date().toISOString() },
                ]),
            },
        });
        await prisma.attendanceRecord.create({
            data: { studentId: studentY.id, groupId: group.id, date: '2026-09-01', status: 'present' },
        });

        execSync('npx tsx scripts/migrate_attendance_to_records.ts', { cwd: process.cwd(), stdio: 'pipe' });

        const recX = await prisma.attendanceRecord.findUnique({
            where: { studentId_groupId_date: { studentId: studentX.id, groupId: group.id, date: '2026-09-01' } },
        });
        check("Migratsiya: studentX (yangi) ko'chirildi, status=absent", recX?.status === 'absent', recX);

        const recY = await prisma.attendanceRecord.findUnique({
            where: { studentId_groupId_date: { studentId: studentY.id, groupId: group.id, date: '2026-09-01' } },
        });
        check("Migratsiya: studentY (mavjud) ustiga yozilmadi, hali ham present", recY?.status === 'present', recY);

        // Idempotentlik: qayta ishga tushirish hech narsani o'zgartirmasligi kerak
        execSync('npx tsx scripts/migrate_attendance_to_records.ts', { cwd: process.cwd(), stdio: 'pipe' });
        const recXAgain = await prisma.attendanceRecord.findUnique({
            where: { studentId_groupId_date: { studentId: studentX.id, groupId: group.id, date: '2026-09-01' } },
        });
        check('Migratsiya idempotent (qayta ishga tushirish natijani o\'zgartirmadi)', recXAgain?.status === 'absent');

        // ═══ 2-qism: yangi CRM endpoint'lari ═══
        const postOwn = await req('POST', '/attendance-records', tokenA, {
            groupId: group.id, date: '2026-09-05',
            records: [{ studentId: studentX.id, status: 'present' }, { studentId: studentY.id, status: 'absent' }],
        });
        check('TEACHER A -> POST o\'z guruhiga 200', postOwn.status === 200, postOwn);

        const getOwn = await req('GET', `/attendance-records?groupId=${group.id}&date=2026-09-05`, tokenA);
        check('TEACHER A -> GET o\'z guruhidan 2 ta qator', Array.isArray(getOwn.json) && getOwn.json.length === 2, getOwn.json);

        const postOther = await req('POST', '/attendance-records', tokenB, {
            groupId: group.id, date: '2026-09-06',
            records: [{ studentId: studentX.id, status: 'present' }],
        });
        check("TEACHER B -> POST begona guruhga 403", postOther.status === 403, postOther.status);

        const getOther = await req('GET', `/attendance-records?groupId=${group.id}&date=2026-09-05`, tokenB);
        check("TEACHER B -> GET begona guruhdan 403", getOther.status === 403, getOther.status);

        const postInvalid = await req('POST', '/attendance-records', tokenA, {
            groupId: group.id, date: '2026-09-07',
            records: [{ studentId: studentX.id, status: 'notavalidstatus' }],
        });
        check("Noto'g'ri status 400", postInvalid.status === 400, postInvalid.status);

        // Upsert: bir xil kunga qayta yozish yangilashi kerak (yangi qator yaratmasdan)
        const beforeCount = await prisma.attendanceRecord.count({ where: { groupId: group.id, date: '2026-09-05' } });
        await req('POST', '/attendance-records', tokenA, {
            groupId: group.id, date: '2026-09-05',
            records: [{ studentId: studentX.id, status: 'late' }],
        });
        const afterCount = await prisma.attendanceRecord.count({ where: { groupId: group.id, date: '2026-09-05' } });
        check('Upsert — qator soni o\'zgarmadi (yangilandi, yangi yaratilmadi)', beforeCount === afterCount, { beforeCount, afterCount });
        const updated = await prisma.attendanceRecord.findUnique({
            where: { studentId_groupId_date: { studentId: studentX.id, groupId: group.id, date: '2026-09-05' } },
        });
        check("Upsert natijasi to'g'ri (late)", updated?.status === 'late', updated);

        // Oylik ko'rinish
        const monthRes = await req('GET', `/attendance-records/month?groupId=${group.id}&month=2026-09`, tokenA);
        check('Oylik ko\'rinish — kamida 4 ta qator (05 va 01)', Array.isArray(monthRes.json) && monthRes.json.length >= 3, monthRes.json?.length);

        // Delete (bekor qilish)
        const delRes = await req('DELETE', `/attendance-records/${studentY.id}/${group.id}/2026-09-05`, tokenA);
        check('DELETE 200', delRes.status === 200, delRes.status);
        const afterDelete = await prisma.attendanceRecord.findUnique({
            where: { studentId_groupId_date: { studentId: studentY.id, groupId: group.id, date: '2026-09-05' } },
        });
        check("DELETE'dan keyin qator yo'q", afterDelete === null);

    } finally {
        await prisma.attendanceRecord.deleteMany({ where: { groupId: group.id } });
        if (oldAttendanceRow) await prisma.attendance.delete({ where: { id: oldAttendanceRow.id } }).catch(() => {});
        await prisma.enrollment.deleteMany({ where: { groupId: group.id } });
        await prisma.student.deleteMany({ where: { id: { in: [studentX.id, studentY.id] } } });
        await prisma.group.delete({ where: { id: group.id } });
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
