import express from 'express';
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function formatICalDate(dateStr: string, timeStr?: string): string {
    const [y, m, d] = dateStr.split('-');
    if (timeStr) {
        const [h, min] = timeStr.split(':');
        return `${y}${m}${d}T${h}${min}00`;
    }
    return `${y}${m}${d}`;
}

const DAY_NAMES: Record<number, string> = {
    1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA', 7: 'SU',
};

// GET /api/ical/group/:groupId.ics — guruh jadvali iCal
// MUHIM: bu route ilgari HECH QANDAY autentifikatsiyasiz edi — guruh ID'sini
// bilgan/topgan har kim dars jadvalini (o'qituvchi ismi, xona, vaqt) olardi.
// Frontendda bu URL'ga hech qanday havola yo'q (tekshirildi), shuning uchun
// requireAuth qo'shish mavjud funksionallikni buzmaydi.
router.get('/group/:groupId.ics', requireAuth, async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const requester = (req as any).user;

        const group = await prisma.group.findFirst({
            where: { id: groupId },
            include: {
                course:   { select: { name: true } },
                teacher:  { select: { name: true } },
            },
        });

        if (!group) return res.status(404).send('Guruh topilmadi');
        if (requester.role === 'TEACHER' && group.teacherId !== requester.id) {
            return res.status(403).send('Bu guruhga tegishli emassiz');
        }

        // Haqiqiy dars jadvali GroupSchedule modelida ("schedule" kolleksiyasi,
        // CrmGroups.tsx/CrmSchedule.tsx to'ldiradi) — Group.schedules (alohida
        // "Schedule" modeli) hech qayerda yozilmaydi, shuning uchun bu eksport
        // doim bo'sh kalendar qaytarardi.
        const schedules = await prisma.groupSchedule.findMany({ where: { groupId } });

        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Tayyorlov CRM//UZ',
            `X-WR-CALNAME:${group.name}`,
            'X-WR-TIMEZONE:Asia/Tashkent',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
        ];

        for (const schedule of schedules) {
            const uid = `group-${groupId}-schedule-${schedule.id}@tayyorlov`;
            const summary = group.name + (group.course ? ` — ${group.course.name}` : '');
            const startDate = group.startDate || todayDateStr();
            const endDate = group.endDate || '2027-01-01';
            let dayNums: number[] = [];
            try { dayNums = JSON.parse(schedule.days || '[]'); } catch { dayNums = []; }
            const byDay = dayNums.map(d => DAY_NAMES[d]).filter(Boolean).join(',');
            if (!byDay) continue;

            lines.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTART;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.startTime)}`,
                `DTEND;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.endTime)}`,
                `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${formatICalDate(endDate)}`,
                `SUMMARY:${summary}`,
                `DESCRIPTION:O'qituvchi: ${group.teacher?.name || 'Belgilanmagan'}`,
                `LOCATION:${schedule.room || ''}`,
                `STATUS:CONFIRMED`,
                'END:VEVENT',
            );
        }

        lines.push('END:VCALENDAR');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${group.name}.ics"`);
        res.send(lines.join('\r\n'));
    } catch (err: any) {
        res.status(500).send(err.message);
    }
});

// GET /api/ical/teacher/:userId.ics — o'qituvchi jadvali
// MUHIM: xuddi yuqoridagi kabi, ilgari autentifikatsiyasiz edi.
router.get('/teacher/:userId.ics', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const requester = (req as any).user;
        if (requester.role === 'TEACHER' && userId !== requester.id) {
            return res.status(403).send('Faqat o\'z jadvalingizni ko\'rishingiz mumkin');
        }

        const groups = await prisma.group.findMany({
            where: { teacherId: userId, deletedAt: null },
            include: {
                course:    { select: { name: true } },
            },
        });

        // Haqiqiy dars jadvali GroupSchedule modelida — Group.schedules (Schedule
        // modeli) hech qayerda yozilmaydi (yuqoridagi /group/:id.ics'dagi kabi izoh).
        const groupIds = groups.map(g => g.id);
        const schedules = groupIds.length
            ? await prisma.groupSchedule.findMany({ where: { groupId: { in: groupIds } } })
            : [];
        const groupMap = new Map(groups.map(g => [g.id, g]));

        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Tayyorlov CRM//UZ',
            'X-WR-CALNAME:Mening Dars Jadvalim',
            'X-WR-TIMEZONE:Asia/Tashkent',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
        ];

        for (const schedule of schedules) {
            const group = groupMap.get(schedule.groupId);
            if (!group) continue;
            const uid = `teacher-${userId}-group-${group.id}-schedule-${schedule.id}@tayyorlov`;
            const startDate = group.startDate || todayDateStr();
            const endDate = group.endDate || '2027-01-01';
            let dayNums: number[] = [];
            try { dayNums = JSON.parse(schedule.days || '[]'); } catch { dayNums = []; }
            const byDay = dayNums.map(d => DAY_NAMES[d]).filter(Boolean).join(',');
            if (!byDay) continue;

            lines.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTART;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.startTime)}`,
                `DTEND;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.endTime)}`,
                `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${formatICalDate(endDate)}`,
                `SUMMARY:${group.name}${group.course ? ' — ' + group.course.name : ''}`,
                `LOCATION:${schedule.room || ''}`,
                'STATUS:CONFIRMED',
                'END:VEVENT',
            );
        }

        lines.push('END:VCALENDAR');

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="jadvalim.ics"');
        res.send(lines.join('\r\n'));
    } catch (err: any) {
        res.status(500).send(err.message);
    }
});

export default router;
