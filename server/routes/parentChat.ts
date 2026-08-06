/**
 * Ota-ona ↔ xodim (menejer/o'qituvchi) chat — CRM (xodim) tomoni.
 * Parent tomoni: server/routes/portal.ts (/chat-threads).
 *
 * ID sxemasi (Message.senderId/receiverId — sxemada erkin string, FK yo'q):
 *   - Ota-ona/o'quvchi tomoni har doim:  `student:${studentId}`
 *   - Menejer tomoni (umumiy, barcha menejer/admin ko'radi/javob beradi): `staff:manager`
 *   - Muayyan o'qituvchi tomoni: `staff:teacher:${teacherId}`
 * Shu sxema tufayli har bir o'quvchi uchun ANIQ 2 xil suhbat turi bo'ladi:
 * (1) shu o'quvchi ↔ menejer, (2) shu o'quvchi ↔ har bir unga dars beradigan o'qituvchi.
 */
import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { emitToUser, emitToAdmins } from '../services/realtime.js';

const router = express.Router();

const MANAGER_KEY = 'staff:manager';
const teacherKey = (teacherId: string) => `staff:teacher:${teacherId}`;
const studentKey = (studentId: string) => `student:${studentId}`;

function isManagerRole(role: string) {
    return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
}

// GET /api/parent-chat/threads — joriy xodimga tegishli barcha ota-ona suhbatlari
// (MANAGER/ADMIN uchun — barcha o'quvchilar; TEACHER uchun — faqat o'z guruhidagilar)
router.get('/threads', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user;
        const staffKey = isManagerRole(user.role) ? MANAGER_KEY : teacherKey(user.id);

        const msgs = await prisma.message.findMany({
            where: { OR: [{ senderId: staffKey }, { receiverId: staffKey }] },
            orderBy: { createdAt: 'desc' },
        });

        const byStudent = new Map<string, { lastMsg: any; unread: number }>();
        for (const m of msgs) {
            const other = m.senderId === staffKey ? m.receiverId : m.senderId;
            if (!other.startsWith('student:')) continue;
            if (!byStudent.has(other)) byStudent.set(other, { lastMsg: m, unread: 0 });
            const entry = byStudent.get(other)!;
            if (m.receiverId === staffKey && !m.readAt) entry.unread++;
        }

        const studentIds = Array.from(byStudent.keys()).map(k => k.replace('student:', ''));
        const students = await prisma.student.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, name: true, photo: true, parentName: true },
        });
        const studentMap = new Map(students.map(s => [s.id, s]));

        const threads = Array.from(byStudent.entries()).map(([key, v]) => {
            const sid = key.replace('student:', '');
            const s = studentMap.get(sid);
            return {
                studentId: sid,
                studentName: s?.name || "Noma'lum o'quvchi",
                studentPhoto: s?.photo || null,
                parentName: s?.parentName || null,
                lastMessage: v.lastMsg.content,
                lastMessageAt: v.lastMsg.createdAt,
                unread: v.unread,
            };
        }).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

        res.json(threads);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/parent-chat/threads/:studentId — bitta o'quvchi bilan suhbat tarixi
router.get('/threads/:studentId', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user;
        const staffKey = isManagerRole(user.role) ? MANAGER_KEY : teacherKey(user.id);
        const sKey = studentKey(req.params.studentId);

        const messages = await prisma.message.findMany({
            where: { OR: [{ senderId: staffKey, receiverId: sKey }, { senderId: sKey, receiverId: staffKey }] },
            orderBy: { createdAt: 'asc' },
            take: 200,
        });

        await prisma.message.updateMany({
            where: { senderId: sKey, receiverId: staffKey, readAt: null },
            data: { readAt: new Date() },
        });

        res.json(messages);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/parent-chat/threads/:studentId — xodim ota-onaga xabar yozadi
router.post('/threads/:studentId', requireAuth, async (req, res) => {
    try {
        const user = (req as any).user;
        const { content } = req.body as { content: string };
        if (!content?.trim()) return res.status(400).json({ message: 'Xabar matni kiritilishi shart' });

        const staffKey = isManagerRole(user.role) ? MANAGER_KEY : teacherKey(user.id);
        const sKey = studentKey(req.params.studentId);

        const message = await prisma.message.create({
            data: {
                senderId: staffKey,
                receiverId: sKey,
                senderType: isManagerRole(user.role) ? 'manager' : 'teacher',
                content: content.trim(),
            },
        });

        res.status(201).json(message);
    } catch (err: any) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * Portal (ota-ona) tomonidan chaqiriladi — server/routes/portal.ts ichida.
 * Bu yordamchi shu faylda turishi mantiqan to'g'ri (staffKey aniqlash logikasi shu yerda).
 */
export async function notifyStaffOfParentMessage(receiverKey: string, studentName: string, content: string) {
    if (receiverKey === MANAGER_KEY) {
        emitToAdmins('parent-message:new', { studentName, content });
        return;
    }
    if (receiverKey.startsWith('staff:teacher:')) {
        const teacherId = receiverKey.replace('staff:teacher:', '');
        emitToUser(teacherId, 'parent-message:new', { studentName, content });
    }
}

export { MANAGER_KEY, teacherKey, studentKey };
export default router;
