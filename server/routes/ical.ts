import express from 'express';
import prisma from '../db.js';

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
router.get('/group/:groupId.ics', async (req, res) => {
    try {
        const groupId = req.params.groupId;

        const group = await prisma.group.findFirst({
            where: { id: groupId },
            include: {
                schedules: { include: { room: { select: { name: true } } } },
                course:   { select: { name: true } },
                teacher:  { select: { name: true } },
            },
        });

        if (!group) return res.status(404).send('Guruh topilmadi');

        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Tayyorlov CRM//UZ',
            `X-WR-CALNAME:${group.name}`,
            'X-WR-TIMEZONE:Asia/Tashkent',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
        ];

        for (const schedule of group.schedules) {
            const uid = `group-${groupId}-schedule-${schedule.id}@tayyorlov`;
            const summary = group.name + (group.course ? ` — ${group.course.name}` : '');
            const startDate = group.startDate || new Date().toISOString().split('T')[0];
            const endDate = group.endDate || '2027-01-01';
            const dayName = DAY_NAMES[schedule.dayOfWeek] || 'MO';
            const roomName = schedule.room?.name || '';

            lines.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTART;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.startTime)}`,
                `DTEND;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.endTime)}`,
                `RRULE:FREQ=WEEKLY;BYDAY=${dayName};UNTIL=${formatICalDate(endDate)}`,
                `SUMMARY:${summary}`,
                `DESCRIPTION:O'qituvchi: ${group.teacher?.name || 'Belgilanmagan'}`,
                `LOCATION:${roomName}`,
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
router.get('/teacher/:userId.ics', async (req, res) => {
    try {
        const { userId } = req.params;

        const groups = await prisma.group.findMany({
            where: { teacherId: userId, deletedAt: null },
            include: {
                schedules: { include: { room: { select: { name: true } } } },
                course:    { select: { name: true } },
            },
        });

        const lines: string[] = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Tayyorlov CRM//UZ',
            'X-WR-CALNAME:Mening Dars Jadvalim',
            'X-WR-TIMEZONE:Asia/Tashkent',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
        ];

        for (const group of groups) {
            for (const schedule of group.schedules) {
                const uid = `teacher-${userId}-group-${group.id}-schedule-${schedule.id}@tayyorlov`;
                const startDate = group.startDate || new Date().toISOString().split('T')[0];
                const endDate = group.endDate || '2027-01-01';
                const dayName = DAY_NAMES[schedule.dayOfWeek] || 'MO';
                const roomName = schedule.room?.name || '';

                lines.push(
                    'BEGIN:VEVENT',
                    `UID:${uid}`,
                    `DTSTART;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.startTime)}`,
                    `DTEND;TZID=Asia/Tashkent:${formatICalDate(startDate, schedule.endTime)}`,
                    `RRULE:FREQ=WEEKLY;BYDAY=${dayName};UNTIL=${formatICalDate(endDate)}`,
                    `SUMMARY:${group.name}${group.course ? ' — ' + group.course.name : ''}`,
                    `LOCATION:${roomName}`,
                    'STATUS:CONFIRMED',
                    'END:VEVENT',
                );
            }
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
