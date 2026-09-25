/**
 * IP-09 backfill (J.3) — a'zolik davrlari, tarif/ustoz/foiz tarixi, o'quvchi kodi.
 *
 *   npx tsx scripts/backfill_ip09.ts                 # DRY-RUN: faqat hisobot, hech narsa yozmaydi
 *   npx tsx scripts/backfill_ip09.ts --apply         # yozadi (idempotent — qayta ishga tushirish xavfsiz)
 *   ... --rate-from 2026-10-01                       # ustoz foizi tarixi boshlanishi (standart: joriy oy 1-sanasi)
 *   ... --out hisobot.md
 *
 * Tamoyillar (reja J.1): hech narsa o'chirilmaydi va taxmin bilan taqsimlanmaydi.
 * - Har bir joriy `Enrollment` qatori FAOL davr sifatida aks ettiriladi (kesh bilan
 *   bir xil holat). Boshlanish sanasi dalildan: shu guruhdagi birinchi davomat va
 *   `Enrollment.createdAt` dan erta bo'lgani (dalil darajasi `startSource`da).
 *   Ketgan/bitirgan/arxivlangan o'quvchi yoki yakunlangan guruhdagi a'zoliklar —
 *   TEKSHIRISH NAVBATIGA (UI orqali to'g'ri sana bilan yakunlanadi), avtomatik
 *   yopilmaydi (J.3 dan ongli chetlanish: kesh va tarix zid bo'lmasligi uchun).
 * - `Enrollment`i yo'q, lekin davomati bor (o'quvchi, guruh) juftliklari — sobiq
 *   a'zolik: yakunlangan davr [birinchi davomat, oxirgi davomat], sabab `unknown`.
 * - Tarif: guruh narxi (yo'q bo'lsa kurs narxi) guruh boshlanishidan; ustoz — joriy
 *   `Group.teacherId`; foiz — joriy `User.salaryPercent`, `--rate-from` dan.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { readOnlyPrisma } from '../server/utils/readOnlyPrisma.js';
import { todayDateStr } from '../server/utils/timezone.js';
import { firstOfMonth, isValidDate } from '../server/domain/lessonCalendar.js';
import { normalizePhone, formatStudentCode, parseStudentCode } from '../server/services/studentIdentity.js';
import { getBillingSettings } from '../server/services/billing.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const RATE_FROM = arg('--rate-from') || firstOfMonth(todayDateStr());
if (!isValidDate(RATE_FROM)) { console.error('--rate-from YYYY-MM-DD bo\'lishi kerak'); process.exit(2); }

const raw = new PrismaClient();
const db: any = APPLY ? raw : readOnlyPrisma(raw);
const short = (id: string) => id.slice(0, 8);

interface Review { kind: string; ids: string[]; note: string }
const review: Review[] = [];
const addReview = (kind: string, id: string, note: string) => {
    let r = review.find(x => x.kind === kind);
    if (!r) review.push(r = { kind, ids: [], note });
    r.ids.push(id);
};
const counts: Record<string, number> = {};
const inc = (k: string, n = 1) => { counts[k] = (counts[k] || 0) + n; };

async function main() {
    const today = todayDateStr();
    const settings = await getBillingSettings();
    const [students, groups, enrollments, periods, attendance, tariffs, assigns, rates, users, seq] = await Promise.all([
        db.student.findMany({ select: { id: true, code: true, phone: true, phoneNorm: true, createdAt: true, status: true, deletedAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
        db.group.findMany({ select: { id: true, price: true, teacherId: true, startDate: true, status: true, deletedAt: true, createdAt: true, course: { select: { price: true } } } }),
        db.enrollment.findMany({ select: { id: true, studentId: true, groupId: true, createdAt: true, userId: true } }),
        db.enrollmentPeriod.findMany({ select: { studentId: true, groupId: true, status: true } }),
        db.attendanceRecord.groupBy({ by: ['studentId', 'groupId'], _min: { date: true }, _max: { date: true } }),
        db.tariffVersion.findMany({ select: { groupId: true } }),
        db.groupTeacherAssignment.findMany({ select: { groupId: true } }),
        db.teacherRate.findMany({ select: { teacherId: true } }),
        db.user.findMany({ select: { id: true, salaryPercent: true, role: true } }),
        db.setting.findUnique({ where: { key: 'student_code_seq' } }),
    ]);
    const studentById = new Map<string, any>(students.map((s: any) => [s.id, s]));
    const groupById = new Map<string, any>(groups.map((g: any) => [g.id, g]));
    const att = new Map<string, { first: string; last: string }>();
    for (const a of attendance) if (a._min.date) att.set(`${a.studentId}|${a.groupId}`, { first: a._min.date, last: a._max.date });
    const periodPairs = new Set(periods.map((p: any) => `${p.studentId}|${p.groupId}`));
    const activePairs = new Set(periods.filter((p: any) => p.status === 'active').map((p: any) => `${p.studentId}|${p.groupId}`));
    const enrPairs = new Set(enrollments.map((e: any) => `${e.studentId}|${e.groupId}`));

    // 1. O'quvchi kodi va phoneNorm
    let next = Math.max(Number(seq?.value || 0), ...students.map((s: any) => parseStudentCode(s.code) ?? 0));
    for (const s of students) {
        const data: any = {};
        if (!s.code) { data.code = formatStudentCode(++next); inc('Kod berildi'); }
        const norm = normalizePhone(s.phone);
        if (norm !== s.phoneNorm) { data.phoneNorm = norm; inc('phoneNorm yangilandi'); }
        if (APPLY && Object.keys(data).length) await db.student.update({ where: { id: s.id }, data });
    }
    if (APPLY) await db.setting.upsert({ where: { key: 'student_code_seq' }, create: { key: 'student_code_seq', value: String(next) }, update: { value: String(next) } });

    // 2. Joriy a'zoliklar → faol davrlar
    for (const e of enrollments) {
        const key = `${e.studentId}|${e.groupId}`;
        if (activePairs.has(key)) { inc('Davr allaqachon bor (o\'tkazildi)'); continue; }
        const s = studentById.get(e.studentId);
        const g = groupById.get(e.groupId);
        const created = todayDateStr(new Date(e.createdAt));
        const a = att.get(key);
        const byAtt = !!a && a.first < created;
        const startDate = byAtt ? a!.first : created;
        const startSource = byAtt ? 'backfill_attendance' : 'backfill_created';
        inc(`Faol davr (${startSource})`);
        if (g?.startDate && startDate < g.startDate) addReview('start_before_group', e.id, "Davr guruh boshlanish sanasidan oldin — guruh sanasi yoki a'zolik sanasini tekshiring");
        if (!byAtt && !a) addReview('no_attendance', e.id, "Davomat yo'q — boshlanish sanasi faqat Enrollment.createdAt (import sanasi bo'lishi mumkin)");
        if (s?.deletedAt) addReview('archived_student', e.id, "Arxivlangan o'quvchining a'zoligi — kerak bo'lsa UI'da yakunlang");
        else if (['left', 'graduated'].includes(s?.status)) addReview('left_but_enrolled', e.id, "O'quvchi ketgan/bitirgan, lekin guruhda — UI'da to'g'ri sana bilan yakunlang");
        if (g?.status === 'completed' || g?.deletedAt) addReview('inactive_group', e.id, "Yakunlangan yoki arxivlangan guruhdagi a'zolik — UI'da yakunlang");
        if (APPLY) await db.enrollmentPeriod.create({ data: { studentId: e.studentId, groupId: e.groupId, startDate, startSource, createdById: null, note: 'IP-09 backfill' } });
    }

    // 3. Sobiq a'zoliklar (davomati bor, joriy a'zoligi va davri yo'q)
    for (const [key, a] of att) {
        if (enrPairs.has(key) || periodPairs.has(key)) continue;
        const [studentId, groupId] = key.split('|');
        if (!studentById.has(studentId) || !groupById.has(groupId)) { inc("Yetim davomat (o'quvchi/guruh yo'q) — o'tkazildi"); continue; }
        inc('Yakunlangan sobiq davr (backfill_attendance)');
        if (APPLY) await db.enrollmentPeriod.create({
            data: { studentId, groupId, startDate: a.first, endDate: a.last, status: 'ended', endReason: 'unknown', startSource: 'backfill_attendance', endSource: 'backfill_attendance', note: 'IP-09 backfill: davomatdan tiklangan sobiq a\'zolik' },
        });
    }

    // 4–5. Tarif va ustoz tayinlash
    const hasTariff = new Set(tariffs.map((t: any) => t.groupId));
    const hasAssign = new Set(assigns.map((t: any) => t.groupId));
    const firstAttByGroup = new Map<string, string>();
    for (const a of attendance) { const g = a.groupId; const d = a._min.date; if (d && (!firstAttByGroup.has(g) || d < firstAttByGroup.get(g)!)) firstAttByGroup.set(g, d); }
    for (const g of groups) {
        const from = g.startDate && isValidDate(g.startDate) ? g.startDate : (firstAttByGroup.get(g.id) || todayDateStr(new Date(g.createdAt)));
        if (!g.startDate) addReview('group_no_start', g.id, "Guruh boshlanish sanasi yo'q — tarix birinchi davomat/yaratilish sanasidan");
        if (!hasTariff.has(g.id)) {
            const price = g.price ?? g.course?.price ?? null;
            if (price == null) addReview('group_no_price', g.id, "Guruh va kursda narx yo'q — tarif yaratilmadi");
            else {
                if (!Number.isInteger(price)) addReview('fractional_price', g.id, `Kasr narx ${price} — butun so'mga yaxlitlandi`);
                inc('Tarif versiyasi');
                if (APPLY) await db.tariffVersion.create({ data: { groupId: g.id, monthlyPrice: Math.round(price), lessonsPerPackage: settings.lessonsPerMonth, effectiveFrom: from, source: 'backfill' } });
            }
        }
        if (!hasAssign.has(g.id) && g.teacherId) {
            inc('Ustoz tayinlash');
            if (APPLY) await db.groupTeacherAssignment.create({ data: { groupId: g.id, teacherId: g.teacherId, fromDate: from, source: 'backfill' } });
        }
    }

    // 6. Ustoz foizi
    const hasRate = new Set(rates.map((r: any) => r.teacherId));
    for (const u of users) {
        if (u.salaryPercent == null || hasRate.has(u.id)) continue;
        inc('Ustoz foizi versiyasi');
        if (APPLY) await db.teacherRate.create({ data: { teacherId: u.id, rateBp: Math.round(u.salaryPercent * 100), effectiveFrom: RATE_FROM, source: 'backfill' } });
    }

    // Hisobot
    const out: string[] = [];
    out.push(`# IP-09 backfill — ${APPLY ? 'YOZILDI' : 'DRY-RUN (hech narsa yozilmadi)'} — ${today}`);
    out.push('');
    out.push(`Ustoz foizi boshlanishi: ${RATE_FROM}; standart oylik darslar: ${settings.lessonsPerMonth}.`);
    out.push('');
    out.push('| Amal | Soni |');
    out.push('|---|---:|');
    for (const [k, v] of Object.entries(counts)) out.push(`| ${k} | ${v} |`);
    out.push('');
    out.push('## Tekshirish navbati');
    if (!review.length) out.push('Bo\'sh.');
    for (const r of review) out.push(`- **${r.kind}** (${r.ids.length}): ${r.note}. Misollar: ${r.ids.slice(0, 8).map(short).join(', ')}${r.ids.length > 8 ? ' …' : ''}`);
    return out.join('\n') + '\n';
}

main()
    .then(text => {
        const o = arg('--out');
        if (o) { fs.writeFileSync(o, text); console.log(`Yozildi: ${o}`); } else process.stdout.write(text);
    })
    .catch(e => { console.error('BACKFILL XATOSI:', e.message); process.exitCode = 1; })
    .finally(() => raw.$disconnect());
