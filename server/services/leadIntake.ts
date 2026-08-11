/**
 * Lid qabul quvuri — ommaviy forma (server/routes/public.ts) va CRM'dan qo'lda
 * yaratish (Faza 3, server/routes/leads.ts) uchun BITTA umumiy yo'l. Maqsad:
 * ikkala manbadan kelgan lid bir xil qoidalarga (dublikat, avtomatik
 * biriktirish, ball, bildirishnoma) bo'ysunishi.
 *
 * Bu yerda HECH QANDAY HTTP narsasi yo'q (request/response) — faqat sof
 * Prisma+biznes mantiq, shuning uchun uni istalgan chaqiruvchi joydan
 * (public yoki autentifikatsiyalangan) ishlatish mumkin.
 */
import prisma from '../db.js';
import { emitToAdmins, emitToUser } from './realtime.js';
import { sendNewLeadAlert } from './telegramService.js';
import {
    OPEN_STAGES, phoneLast9, isValidUzMobile, buildSearchKey, resolveSourceFromUtm,
} from '../constants/leads.js';

export class LeadIntakeValidationError extends Error {}

export interface LeadIntakeInput {
    name: string;
    phone: string;
    email?: string | null;
    course?: string | null;
    courseId?: string | null; // Course jadvalidagi id — relation emas, faqat guruhlash uchun
    notes?: string | null;
    extraField?: string | null;
    source?: string | null; // qo'lda tanlangan manba (masalan CRM'dan yaratilganda)
    formId?: string | null;
    campaignId?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    clickId?: string | null;
    landingPage?: string | null;
    referrer?: string | null;
    ipHash?: string | null;
    honeypot?: string | null;
}

export type LeadIntakeResult =
    | { ok: true; id: string; merged: boolean; duplicateOfId: string | null }
    | { ok: false; reason: 'honeypot' };

// ─── Validatsiya / normalizatsiya ──────────────────────────────────────────────

function sanitizeText(v: string | null | undefined, maxLen: number): string | null {
    if (!v) return null;
    const s = String(v).trim();
    return s ? s.slice(0, maxLen) : null;
}

function validate(input: LeadIntakeInput) {
    const name = sanitizeText(input.name, 200);
    if (!name || name.length < 2) {
        throw new LeadIntakeValidationError("Ism kiritilishi shart (kamida 2 belgi)");
    }
    if (/https?:\/\//i.test(name)) {
        throw new LeadIntakeValidationError("Noto'g'ri ism formati");
    }
    const phoneNorm = phoneLast9(input.phone || '');
    if (!isValidUzMobile(phoneNorm)) {
        throw new LeadIntakeValidationError("Telefon raqam noto'g'ri formatda");
    }
    return { name, phoneNorm };
}

// ─── Avtomatik ball ─────────────────────────────────────────────────────────────

function computeIntakeScore(input: LeadIntakeInput, opts: { hasCourseId: boolean; fromPaidCampaign: boolean; isRepeat: boolean }): number {
    let score = 30;
    if (opts.hasCourseId) score += 15;
    else if (input.course) score += 5;
    if (input.email) score += 10;
    if (opts.fromPaidCampaign) score += 15;
    score += 10; // telefon UZ formatida tasdiqlangan (validate() shu yerga yetgunicha tekshirgan)
    if (input.extraField) score += 10;
    if (input.notes && input.notes.trim().length > 20) score += 10;
    if (opts.isRepeat) score += 10;
    return Math.max(0, Math.min(100, score));
}

function statusFromScore(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 70) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
}

// ─── UTM → kampaniya aniqlash ───────────────────────────────────────────────────

async function resolveCampaign(input: LeadIntakeInput): Promise<{ id: string; platform: string } | null> {
    if (input.campaignId) {
        const c = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { id: true, platform: true } });
        if (c) return c;
    }
    if (input.formId) {
        const form = await prisma.targetForm.findUnique({ where: { id: input.formId }, select: { campaignId: true } });
        if (form?.campaignId) {
            const c = await prisma.campaign.findUnique({ where: { id: form.campaignId }, select: { id: true, platform: true } });
            if (c) return c;
        }
    }
    if (input.utmCampaign) {
        const c = await prisma.campaign.findFirst({
            where: { utmCampaign: { equals: input.utmCampaign } },
            select: { id: true, platform: true },
        });
        if (c) return c;
    }
    if (input.utmSource) {
        const alias = resolveSourceFromUtm(input.utmSource);
        if (alias) {
            const c = await prisma.campaign.findFirst({
                where: { platform: alias, status: 'active' },
                orderBy: { createdAt: 'desc' },
                select: { id: true, platform: true },
            });
            if (c) return c;
        }
    }
    return null;
}

// ─── Avtomatik biriktirish (least-loaded) ──────────────────────────────────────

function hasLeadAccess(u: { role: string; permissions: string | null }): boolean {
    const role = (u.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    if (role !== 'MANAGER') return false;
    let perms: any = null;
    try { perms = JSON.parse(u.permissions || '[]'); } catch { /* noop */ }
    const isCustomPermArray = Array.isArray(perms) && perms.length > 0 && perms.every((p: any) => typeof p === 'string');
    if (isCustomPermArray) return perms.includes('leads');
    return true; // custom ruxsat yo'q → rol asosidagi standart kirish (MANAGER)
}

async function pickAssignee(): Promise<string | null> {
    const modeSetting = await prisma.setting.findUnique({ where: { key: 'lead_assignment_mode' } });
    if (modeSetting?.value === 'off') return null;

    const poolSetting = await prisma.setting.findUnique({ where: { key: 'lead_assignment_pool' } });
    let poolIds: string[] = [];
    if (poolSetting?.value) {
        try { const parsed = JSON.parse(poolSetting.value); if (Array.isArray(parsed)) poolIds = parsed; } catch { /* noop */ }
    }

    let candidates: string[];
    if (poolIds.length > 0) {
        const users = await prisma.user.findMany({ where: { id: { in: poolIds }, isActive: true }, select: { id: true } });
        candidates = users.map(u => u.id);
    } else {
        const managers = await prisma.user.findMany({
            where: { role: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
            select: { id: true, role: true, permissions: true },
        });
        candidates = managers.filter(hasLeadAccess).map(m => m.id);
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const loads = await prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { in: candidates }, deletedAt: null, stage: { in: OPEN_STAGES } },
        _count: { _all: true },
    });
    const loadMap = new Map(loads.map(l => [l.assignedToId as string, l._count._all]));

    let minLoad = Infinity;
    for (const id of candidates) {
        const load = loadMap.get(id) || 0;
        if (load < minLoad) minLoad = load;
    }
    const tied = candidates.filter(id => (loadMap.get(id) || 0) === minLoad);
    if (tied.length === 1) return tied[0];

    // Teng bo'lsa — eng uzoq vaqtdan beri yangi lid olmagan menejer tanlanadi
    // (adolatli aylanish uchun).
    const lastAssigned = await prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { in: tied } },
        _max: { assignedAt: true },
    });
    const lastMap = new Map(lastAssigned.map(l => [l.assignedToId as string, l._max.assignedAt]));
    tied.sort((a, b) => (lastMap.get(a)?.getTime() ?? 0) - (lastMap.get(b)?.getTime() ?? 0));
    return tied[0];
}

// ─── Bildirishnomalar (uchalasi, mustaqil xatolarga chidamli) ──────────────────

async function notifyNewLead(lead: { id: string; name: string; phone: string; course: string | null; source: string | null }, assignedToId: string | null, kind: 'new' | 'repeat' | 'existing_student') {
    const title = kind === 'repeat' ? 'Takroriy ariza' : kind === 'existing_student' ? "Diqqat: mavjud o'quvchi murojaat qildi" : 'Yangi Lid';
    const message = `${lead.name} (${lead.phone})${lead.course ? ` — ${lead.course}` : ''}`;

    // 1) CRM ichida (in-app) bildirishnoma — egasiga, yoki egasi yo'q bo'lsa broadcast.
    try {
        await prisma.notification.create({
            data: { title, message, type: 'info', isRead: false, userId: assignedToId || undefined },
        });
    } catch { /* jim o'tkaziladi */ }

    // 2) Real-time (socket)
    try {
        emitToAdmins('lead:created', { id: lead.id, name: lead.name, phone: lead.phone, kind });
        if (assignedToId) emitToUser(assignedToId, 'lead:assigned', { id: lead.id, name: lead.name, phone: lead.phone, kind });
    } catch { /* jim o'tkaziladi */ }

    // 3) Telegram — faqat sozlamada yoqilgan bo'lsa
    try {
        const autoLeadSetting = await prisma.setting.findUnique({ where: { key: 'telegram_auto_lead' } });
        if (autoLeadSetting?.value === 'true') {
            const adminChatSetting = await prisma.setting.findUnique({ where: { key: 'telegram_admin_chat_id' } });
            if (adminChatSetting?.value) {
                await sendNewLeadAlert(lead.name, lead.phone, lead.course || '', lead.source || '', adminChatSetting.value);
            }
            if (assignedToId) {
                const assignee = await prisma.user.findUnique({ where: { id: assignedToId }, select: { telegramChatId: true } });
                if (assignee?.telegramChatId) {
                    await sendNewLeadAlert(lead.name, lead.phone, lead.course || '', lead.source || '', assignee.telegramChatId);
                }
            }
        }
    } catch { /* jim o'tkaziladi — tashrifchiga hech qanday 500 bermaydi */ }
}

// ─── Asosiy funksiya ────────────────────────────────────────────────────────────

export async function createLeadFromIntake(input: LeadIntakeInput): Promise<LeadIntakeResult> {
    if (input.honeypot) {
        return { ok: false, reason: 'honeypot' };
    }

    const { name, phoneNorm } = validate(input);
    const course = sanitizeText(input.course, 200);
    const courseId = sanitizeText(input.courseId, 100) || undefined;
    const notes = sanitizeText(input.notes, 2000);
    const extraField = sanitizeText(input.extraField, 200);
    const email = sanitizeText(input.email, 200);

    const campaign = await resolveCampaign(input);
    const resolvedSource = campaign?.platform || resolveSourceFromUtm(input.utmSource) || sanitizeText(input.source, 100) || 'Vebsayt';
    const searchKey = buildSearchKey(name, phoneNorm, course);

    const existing = await prisma.lead.findFirst({
        where: { phoneNorm, deletedAt: null },
        orderBy: { createdAt: 'desc' },
    });

    const attribution = {
        formId: input.formId || undefined,
        campaignId: campaign?.id,
        utmSource: sanitizeText(input.utmSource, 100) || undefined,
        utmMedium: sanitizeText(input.utmMedium, 100) || undefined,
        utmCampaign: sanitizeText(input.utmCampaign, 100) || undefined,
        utmContent: sanitizeText(input.utmContent, 100) || undefined,
        utmTerm: sanitizeText(input.utmTerm, 100) || undefined,
        clickId: sanitizeText(input.clickId, 200) || undefined,
        landingPage: sanitizeText(input.landingPage, 500) || undefined,
        referrer: sanitizeText(input.referrer, 500) || undefined,
        ipHash: input.ipHash || undefined,
    };

    if (existing) {
        const isStudent = !!existing.studentId;
        const isOpen = OPEN_STAGES.includes(existing.stage as any);
        const daysSinceCreated = (Date.now() - existing.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const isStale = daysSinceCreated > 90;

        if (!isStudent && isOpen && !isStale) {
            // ─ Takroriy ariza — mavjud (ochiq) lidga qo'shiladi, yangisi yaratilmaydi.
            const noteAppend = `\n[${new Date().toLocaleString('uz-UZ')}] Qayta ariza yubordi${course ? ` (kurs: ${course})` : ''}`;
            const updated = await prisma.lead.update({
                where: { id: existing.id },
                data: {
                    submitCount: { increment: 1 },
                    notes: (existing.notes || '') + noteAppend,
                    course: existing.course || course || undefined,
                    courseId: existing.courseId || courseId,
                    email: existing.email || email || undefined,
                    extraField: existing.extraField || extraField || undefined,
                    status: 'hot',
                    score: Math.min(100, existing.score + 10),
                    ...(!existing.campaignId && attribution.campaignId ? { campaignId: attribution.campaignId } : {}),
                    ...(!existing.formId && attribution.formId ? { formId: attribution.formId } : {}),
                    ...(!existing.utmSource && attribution.utmSource ? { utmSource: attribution.utmSource } : {}),
                },
            });
            try {
                await prisma.leadActivity.create({
                    data: { leadId: existing.id, type: 'form', content: "Qayta ariza yubordi", date: new Date().toISOString(), direction: 'in' },
                });
            } catch { /* jim o'tkaziladi */ }

            await notifyNewLead(
                { id: updated.id, name: updated.name, phone: updated.phone, course: updated.course, source: updated.source },
                updated.assignedToId,
                'repeat',
            );
            return { ok: true, id: updated.id, merged: true, duplicateOfId: null };
        }

        // ─ Yopilgan / eski / mavjud o'quvchi — yangi lid, lekin dublikat sifatida belgilanadi.
        const assignedToId = await pickAssignee();
        const score = computeIntakeScore(input, { hasCourseId: !!courseId, fromPaidCampaign: !!campaign, isRepeat: false });
        const created = await prisma.lead.create({
            data: {
                name, phone: input.phone, phoneNorm, email, course, courseId, notes, extraField,
                source: resolvedSource, searchKey,
                stage: 'new', status: statusFromScore(score), score,
                date: new Date().toISOString(),
                duplicateOfId: existing.id,
                assignedToId: assignedToId || undefined,
                assignedAt: assignedToId ? new Date() : undefined,
                ...attribution,
            },
        });
        await notifyNewLead(
            { id: created.id, name: created.name, phone: created.phone, course: created.course, source: created.source },
            assignedToId,
            isStudent ? 'existing_student' : 'new',
        );
        return { ok: true, id: created.id, merged: false, duplicateOfId: existing.id };
    }

    // ─ Umuman yangi lid ─────────────────────────────────────────────────────────
    const assignedToId = await pickAssignee();
    const score = computeIntakeScore(input, { hasCourseId: !!courseId, fromPaidCampaign: !!campaign, isRepeat: false });
    const created = await prisma.lead.create({
        data: {
            name, phone: input.phone, phoneNorm, email, course, courseId, notes, extraField,
            source: resolvedSource, searchKey,
            stage: 'new', status: statusFromScore(score), score,
            date: new Date().toISOString(),
            assignedToId: assignedToId || undefined,
            assignedAt: assignedToId ? new Date() : undefined,
            ...attribution,
        },
    });
    await notifyNewLead(
        { id: created.id, name: created.name, phone: created.phone, course: created.course, source: created.source },
        assignedToId,
        'new',
    );
    return { ok: true, id: created.id, merged: false, duplicateOfId: null };
}
