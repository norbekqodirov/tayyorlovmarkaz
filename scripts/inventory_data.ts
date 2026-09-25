/**
 * IP-08 — real ma'lumot inventarizatsiyasi (FAQAT O'QISH).
 *
 * Maqsad: audit topilmalarining (ML/TL/HB) real ma'lumotdagi ta'sirini o'lchash
 * va Bosqich 2 ko'chirish (backfill) xavfini aniqlash. Natija — agregat raqamlar
 * va qisqa ID'lar; ism/telefon kabi shaxsiy ma'lumot hisobotga CHIQARILMAYDI.
 *
 * Ishga tushirish (DATABASE_URL — tekshiriladigan baza; production uchun
 * ASL BAZA EMAS, backup nusxasi — docs/RUNBOOK_BACKUP_RESTORE.md):
 *   npx tsx scripts/inventory_data.ts                  # stdout'ga Markdown
 *   npx tsx scripts/inventory_data.ts --out hisobot.md # faylga
 *
 * Production backup nusxasida (SQLite; yo'l prisma/ papkasiga nisbatan,
 * muhitdagi DATABASE_URL .env'dagidan ustun turadi):
 *   DATABASE_URL="file:../backups/backup-<ts>-pre-deploy.db" npx tsx scripts/inventory_data.ts --out /tmp/inv.md
 *
 * Xavfsizlik: Prisma mijozi faqat-o'qish proksisi orqali ishlatiladi — har
 * qanday yozish metodi (create/update/delete/upsert/executeRaw...) xato otadi.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { todayDateStr } from '../server/utils/timezone.js';
import { normalizeStudentStatus } from '../server/utils/studentStatus.js';
import { readOnlyPrisma } from '../server/utils/readOnlyPrisma.js';

const raw = new PrismaClient();
const db: any = readOnlyPrisma(raw);
const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');

const out: string[] = [];
const h = (t: string) => out.push(`\n## ${t}\n`);
const line = (t = '') => out.push(t);
const table = (rows: Array<[string, string | number]>) => {
    line('| Ko\'rsatkich | Qiymat |');
    line('|---|---:|');
    for (const [k, v] of rows) line(`| ${k} | ${typeof v === 'number' ? v.toLocaleString('ru-RU').replace(/ /g, ' ') : v} |`);
};
const short = (id: string) => id.slice(0, 8);
const examples = (ids: string[], n = 5) => (ids.length ? ids.slice(0, n).map(short).join(', ') + (ids.length > n ? ` … (+${ids.length - n})` : '') : '—');
const isFrac = (x: number | null | undefined) => x != null && !Number.isInteger(x);
const phoneKey = (p?: string | null) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

async function main() {
    const today = todayDateStr();
    const [students, groups, courses, enrollments, payments, invoices, transactions, categories, users, schedules] = await Promise.all([
        db.student.findMany({ select: { id: true, phone: true, status: true, deletedAt: true, balance: true, paymentStatus: true, createdAt: true, group: true, course: true } }),
        db.group.findMany({ select: { id: true, status: true, deletedAt: true, courseId: true, teacherId: true, price: true, startDate: true, endDate: true, maxSize: true } }),
        db.course.findMany({ select: { id: true, price: true, status: true } }),
        db.enrollment.findMany({ select: { id: true, studentId: true, groupId: true, createdAt: true } }),
        db.payment.findMany({ select: { id: true, studentId: true, amount: true, month: true, status: true, deletedAt: true, date: true } }),
        db.invoice.findMany({ select: { id: true, amount: true, status: true, dueDate: true } }),
        db.transaction.findMany({ select: { id: true, type: true, amount: true, category: true, studentId: true, date: true, sourceType: true } }),
        db.transactionCategory.findMany({ select: { name: true, type: true, isActive: true } }),
        db.user.findMany({ select: { id: true, role: true, isActive: true, salaryPercent: true } }),
        db.groupSchedule.findMany({ select: { groupId: true } }),
    ]);
    const attendanceFirst: Array<{ studentId: string; groupId: string; _min: { date: string | null } }> =
        await db.attendanceRecord.groupBy({ by: ['studentId', 'groupId'], _min: { date: true } });

    const studentById = new Map<string, any>(students.map((s: any) => [s.id, s]));
    const groupById = new Map<string, any>(groups.map((g: any) => [g.id, g]));
    const courseById = new Map<string, any>(courses.map((c: any) => [c.id, c]));
    const liveStudents = students.filter((s: any) => !s.deletedAt);
    const liveGroups = groups.filter((g: any) => !g.deletedAt);

    line(`# Ma'lumot inventarizatsiyasi — ${today}`);
    line();
    line(`Baza: ${isSqlite ? 'SQLite' : 'PostgreSQL'}. Skript: \`scripts/inventory_data.ts\` (faqat o'qish). Shaxsiy ma'lumot chiqarilmagan — misollarda ID'ning birinchi 8 belgisi.`);

    // 1. Umumiy hajm
    h('1. Umumiy hajm');
    table([
        ['O\'quvchilar (jami / arxivlangan)', `${students.length} / ${students.length - liveStudents.length}`],
        ['Guruhlar (jami / arxivlangan)', `${groups.length} / ${groups.length - liveGroups.length}`],
        ['Kurslar', courses.length],
        ['A\'zoliklar (Enrollment)', enrollments.length],
        ['To\'lovlar (Payment) / o\'chirilgan', `${payments.length} / ${payments.filter((p: any) => p.deletedAt).length}`],
        ['Invoice\'lar', invoices.length],
        ['Kassa tranzaksiyalari', transactions.length],
        ['Faol foydalanuvchilar (TEACHER)', users.filter((u: any) => u.isActive && u.role === 'TEACHER').length],
    ]);

    // 2. O'quvchi holatlari
    h('2. O\'quvchi holatlari (SY-01)');
    const statusCounts = new Map<string, number>();
    for (const s of liveStudents) statusCounts.set(s.status ?? '(bo\'sh)', (statusCounts.get(s.status ?? '(bo\'sh)') || 0) + 1);
    const nonCanonical = liveStudents.filter((s: any) => normalizeStudentStatus(s.status) !== s.status);
    table([...[...statusCounts.entries()].map(([k, v]) => [`\`${k}\``, v] as [string, number]),
        ['Kanonik bo\'lmagan qiymat (normalize_student_status.ts tuzatadi)', nonCanonical.length]]);

    // 3. Balans va uning manbasi
    h('3. Balans va manbasi (ML-03, HB-01)');
    const incomeByStudent = new Map<string, number>();
    for (const t of transactions) if (t.studentId && t.type === 'income') incomeByStudent.set(t.studentId, (incomeByStudent.get(t.studentId) || 0) + t.amount);
    const neg = liveStudents.filter((s: any) => (s.balance ?? 0) < 0);
    const pos = liveStudents.filter((s: any) => (s.balance ?? 0) > 0);
    // Kod bo'yicha balans faqat kirim tranzaksiyasi bilan oshadi (finance/payments) —
    // shundan farqli qism qo'lda kiritilgan yoki eski yo'llardan (yangi o'quvchiga
    // -narx, bulk, import) kelgan.
    const residual = liveStudents.map((s: any) => ({ id: s.id, r: (s.balance ?? 0) - (incomeByStudent.get(s.id) || 0) })).filter(x => Math.abs(x.r) >= 1);
    table([
        ['Balans < 0 (qarzdor) — soni / jami', `${neg.length} / ${sum(neg.map((s: any) => s.balance)).toLocaleString('ru-RU')}`],
        ['Balans > 0 (avans) — soni / jami', `${pos.length} / ${sum(pos.map((s: any) => s.balance)).toLocaleString('ru-RU')}`],
        ['Balans kirim tranzaksiyalari bilan tushuntirilmaydi (qo\'lda/eski yo\'l)', residual.length],
        ['— shundan manfiy farq (hisoblangan qarz kiritilgan)', residual.filter(x => x.r < 0).length],
        ['— shundan musbat farq', residual.filter(x => x.r > 0).length],
        ['Kasr balanslar', liveStudents.filter((s: any) => isFrac(s.balance)).length],
    ]);
    line();
    line(`Misollar (tushuntirilmagan): ${examples(residual.map(x => x.id))}`);

    // 4. paymentStatus ziddiyati
    h('4. `paymentStatus` va balans ziddiyati (HB-01)');
    const debtNotMarked = liveStudents.filter((s: any) => (s.balance ?? 0) < 0 && s.paymentStatus !== 'Qarzdorlik');
    const markedNotDebt = liveStudents.filter((s: any) => (s.balance ?? 0) >= 0 && s.paymentStatus === 'Qarzdorlik');
    table([
        ['Balans < 0, lekin holat "Qarzdorlik" emas', debtNotMarked.length],
        ['Holat "Qarzdorlik", lekin balans ≥ 0', markedNotDebt.length],
    ]);
    line();
    line('2026-09-25 dan UI qarzdorlikni balansdan hisoblaydi — bu ziddiyat endi ko\'rsatkichlarga ta\'sir qilmaydi, lekin backfill paytida saqlangan holatga ishonilmaydi.');

    // 5. Yetim va arxivlangan bog'liqliklar
    h('5. Yetim yozuvlar');
    const orphanTx = transactions.filter((t: any) => t.studentId && !studentById.has(t.studentId));
    const txArchived = transactions.filter((t: any) => t.studentId && studentById.get(t.studentId)?.deletedAt);
    const enrOrphan = enrollments.filter((e: any) => !studentById.has(e.studentId) || !groupById.has(e.groupId));
    table([
        ['Tranzaksiya — o\'quvchisi o\'chirib yuborilgan (yetim)', `${orphanTx.length} (jami ${sum(orphanTx.map((t: any) => t.amount)).toLocaleString('ru-RU')})`],
        ['Tranzaksiya — o\'quvchisi arxivlangan', txArchived.length],
        ['A\'zolik — o\'quvchi yoki guruh yo\'q', enrOrphan.length],
    ]);
    line();
    line(`Yetim tranzaksiya misollari: ${examples(orphanTx.map((t: any) => t.id))}`);

    // 6. A'zolik holati
    h('6. A\'zoliklar va guruhlar (TL-01…TL-05)');
    const enrByStudent = new Map<string, any[]>();
    for (const e of enrollments) { if (!enrByStudent.has(e.studentId)) enrByStudent.set(e.studentId, []); enrByStudent.get(e.studentId)!.push(e); }
    const liveEnr = (sid: string) => (enrByStudent.get(sid) || []).filter(e => { const g = groupById.get(e.groupId); return g && !g.deletedAt && g.status !== 'completed'; });
    const activeNoGroup = liveStudents.filter((s: any) => normalizeStudentStatus(s.status) === 'active' && liveEnr(s.id).length === 0);
    const leftButEnrolled = liveStudents.filter((s: any) => ['left', 'graduated'].includes(normalizeStudentStatus(s.status) || '') && liveEnr(s.id).length > 0);
    const inCompleted = enrollments.filter((e: any) => groupById.get(e.groupId)?.status === 'completed');
    const inArchivedGroup = enrollments.filter((e: any) => groupById.get(e.groupId)?.deletedAt);
    const multiGroup = liveStudents.filter((s: any) => liveEnr(s.id).length > 1);
    const overCapacity = liveGroups.filter((g: any) => enrollments.filter((e: any) => e.groupId === g.id && !studentById.get(e.studentId)?.deletedAt).length > (g.maxSize || 0));
    const denormMismatch = liveStudents.filter((s: any) => liveEnr(s.id).length > 0 && !s.group);
    table([
        ['Faol o\'quvchi, lekin faol guruhi yo\'q', activeNoGroup.length],
        ['Ketgan/bitirgan, lekin faol guruhda a\'zo', leftButEnrolled.length],
        ['Yakunlangan (completed) guruhdagi a\'zoliklar', inCompleted.length],
        ['Arxivlangan guruhdagi a\'zoliklar', inArchivedGroup.length],
        ['Bir nechta faol guruhdagi o\'quvchilar (TQ-C)', multiGroup.length],
        ['Sig\'imdan oshgan guruhlar', overCapacity.length],
        ['Guruhda, lekin eski `Student.group` matni bo\'sh', denormMismatch.length],
        ['Faol guruh — boshlanish sanasi yo\'q', liveGroups.filter((g: any) => !g.startDate).length],
        ['Faol guruh — ustoz biriktirilmagan', liveGroups.filter((g: any) => !g.teacherId).length],
        ['Faol guruh — dars jadvali (GroupSchedule) yo\'q (IP-10 uchun kerak)', liveGroups.filter((g: any) => !schedules.some((sc: any) => sc.groupId === g.id)).length],
    ]);
    line();
    line(`Faol, guruhsiz: ${examples(activeNoGroup.map((s: any) => s.id))}. Ketgan-lekin-a'zo: ${examples(leftButEnrolled.map((s: any) => s.id))}`);

    // 7. A'zolik sanasi ishonchliligi
    h('7. A\'zolik sanasi va birinchi davomat (backfill dalili, J.3)');
    const firstAtt = new Map<string, string>();
    for (const a of attendanceFirst) if (a._min.date) firstAtt.set(`${a.studentId}|${a.groupId}`, a._min.date);
    let attBefore = 0, sameMonth = 0, noAtt = 0;
    const gaps: number[] = [];
    for (const e of enrollments) {
        const fa = firstAtt.get(`${e.studentId}|${e.groupId}`);
        if (!fa) { noAtt++; continue; }
        const enrDate = todayDateStr(new Date(e.createdAt));
        if (fa < enrDate) attBefore++;
        if (fa.slice(0, 7) === enrDate.slice(0, 7)) sameMonth++;
        gaps.push(Math.round((Date.parse(fa) - Date.parse(enrDate)) / 86400000));
    }
    gaps.sort((a, b) => a - b);
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    table([
        ['A\'zolik davomati bor', enrollments.length - noAtt],
        ['Davomati yo\'q a\'zoliklar', noAtt],
        ['Birinchi davomat `Enrollment.createdAt`dan OLDIN (sana ishonchsiz)', attBefore],
        ['Birinchi davomat a\'zolik bilan bir oyda', sameMonth],
        ['Farq medianasi (kun, davomat − a\'zolik)', median],
    ]);
    line();
    line('Backfill uchun: `startDate` = min(Enrollment.createdAt, birinchi davomat). Davomat oldinroq bo\'lsa, "dalil darajasi: davomat" belgisi bilan saqlanadi.');

    // 8. To'lov va invoice'lar
    h('8. To\'lovlar va invoice\'lar (ML-08, ML-09)');
    const livePay = payments.filter((p: any) => !p.deletedAt);
    const payStatus = new Map<string, number>();
    for (const p of livePay) payStatus.set(p.status, (payStatus.get(p.status) || 0) + 1);
    const invStatus = new Map<string, number>();
    for (const i of invoices) invStatus.set(i.status, (invStatus.get(i.status) || 0) + 1);
    table([
        ...[...payStatus.entries()].map(([k, v]) => [`To'lov holati \`${k}\``, v] as [string, number]),
        ['To\'lov — xizmat oyi (`month`) ko\'rsatilmagan', livePay.filter((p: any) => !p.month).length],
        ['To\'lov — o\'quvchisi arxivlangan', livePay.filter((p: any) => studentById.get(p.studentId)?.deletedAt).length],
        ...[...invStatus.entries()].map(([k, v]) => [`Invoice holati \`${k}\``, v] as [string, number]),
        ['Invoice — muddati o\'tgan, lekin hali `pending`', invoices.filter((i: any) => i.status === 'pending' && i.dueDate < today).length],
    ]);

    // 9. Kasr summalar
    h('9. Kasr summalar (butun so\'mga o\'tish, G.3 §6)');
    table([
        ['To\'lov', payments.filter((p: any) => isFrac(p.amount)).length],
        ['Tranzaksiya', transactions.filter((t: any) => isFrac(t.amount)).length],
        ['Invoice', invoices.filter((i: any) => isFrac(i.amount)).length],
        ['Guruh narxi', groups.filter((g: any) => isFrac(g.price)).length],
        ['Kurs narxi', courses.filter((c: any) => isFrac(c.price)).length],
    ]);

    // 10. Tariflar
    h('10. Tariflar (IP-09 TariffVersion backfill)');
    const noPrice = liveGroups.filter((g: any) => g.price == null && (courseById.get(g.courseId)?.price ?? null) == null);
    const groupPriceSet = liveGroups.filter((g: any) => g.price != null);
    const groupPriceDiffers = groupPriceSet.filter((g: any) => courseById.get(g.courseId) && g.price !== courseById.get(g.courseId).price);
    table([
        ['Faol guruh — o\'z narxi bor', groupPriceSet.length],
        ['— kurs narxidan farq qiladi', groupPriceDiffers.length],
        ['Faol guruh — na guruh, na kurs narxi (hisob chiqarib bo\'lmaydi)', noPrice.length],
        ['TEACHER — foiz (`salaryPercent`) belgilanmagan', users.filter((u: any) => u.role === 'TEACHER' && u.isActive && u.salaryPercent == null).length],
    ]);

    // 11. Dublikatlar
    h('11. Telefon bo\'yicha dublikat o\'quvchilar (TQ-D qidiruvi)');
    const byPhone = new Map<string, string[]>();
    for (const s of liveStudents) { const k = phoneKey(s.phone); if (k) { if (!byPhone.has(k)) byPhone.set(k, []); byPhone.get(k)!.push(s.id); } }
    const dups = [...byPhone.values()].filter(v => v.length > 1);
    table([
        ['Telefoni bor o\'quvchilar', [...byPhone.values()].reduce((a, v) => a + v.length, 0)],
        ['Bir xil telefonli guruhlar (oxirgi 9 raqam)', dups.length],
        ['— ularga tegishli yozuvlar', dups.reduce((a, v) => a + v.length, 0)],
    ]);
    line();
    line('Eslatma: aka-ukalar ota-onaning bitta raqamini ishlatishi mumkin — dublikat har doim xato emas.');

    // 12. Kategoriyalar
    h('12. Tranzaksiya kategoriyalari (ML-05, TQ-E)');
    const catUse = new Map<string, { n: number; sum: number }>();
    for (const t of transactions) { const k = `${t.type}|${t.category}`; const c = catUse.get(k) || { n: 0, sum: 0 }; c.n++; c.sum += t.amount; catUse.set(k, c); }
    const known = new Set(categories.map((c: any) => `${c.type}|${c.name}`));
    line('| Tur | Kategoriya | Soni | Summa | Ro\'yxatda |');
    line('|---|---|---:|---:|---|');
    for (const [k, v] of [...catUse.entries()].sort((a, b) => b[1].sum - a[1].sum)) {
        const [type, name] = k.split('|');
        line(`| ${type} | ${name} | ${v.n} | ${Math.round(v.sum).toLocaleString('ru-RU')} | ${known.has(k) ? '✓' : '✗'} |`);
    }
    const incomeWithStudentNonTuition = transactions.filter((t: any) => t.type === 'income' && t.studentId && !/kurs|to'lov|tolov/i.test(t.category || ''));
    line();
    line(`O'quvchiga bog'langan, lekin kurs to'lovi bo'lmagan kirimlar (TQ-E — balansga ta'sir qilgan bo'lishi mumkin): **${incomeWithStudentNonTuition.length}**`);

    // 13. SQLite
    if (isSqlite) {
        h('13. SQLite sozlamalari');
        const jm = await db.$queryRawUnsafe('PRAGMA journal_mode');
        const pc = await db.$queryRawUnsafe('PRAGMA page_count');
        const ps = await db.$queryRawUnsafe('PRAGMA page_size');
        const val = (r: any) => Object.values((r as any[])[0] || {})[0];
        table([
            ['journal_mode', String(val(jm))],
            ['Hajm (MB)', +(Number(val(pc)) * Number(val(ps)) / 1024 / 1024).toFixed(2)],
        ]);
    }

    line();
    line('---');
    line('Keyingi qadam: har bo\'lim raqami IP-09…IP-25 ko\'chirish qoidalariga (J.3) kirish ma\'lumoti sifatida `docs/MALUMOT_INVENTARIZATSIYASI_<sana>.md` ga ko\'chiriladi.');
}

main()
    .then(() => {
        const text = out.join('\n') + '\n';
        const i = process.argv.indexOf('--out');
        if (i > 0 && process.argv[i + 1]) { fs.writeFileSync(process.argv[i + 1], text); console.log(`Yozildi: ${process.argv[i + 1]}`); }
        else process.stdout.write(text);
    })
    .catch(e => { console.error('INVENTARIZATSIYA XATOSI:', e.message); process.exitCode = 1; })
    .finally(() => raw.$disconnect());
