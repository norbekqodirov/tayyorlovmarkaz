/**
 * IP-26 (RX-04, OQ-13, QT-86): o'qituvchiga o'quvchi haqida faqat o'qitish uchun keraklisi —
 * ism, guruhdagi akademik ma'lumot (davomat, baho), ota-ona ISMI. Telefonlar, manzil, Telegram ID,
 * balans va to'lov holati, ichki izohlar berilmaydi: ota-ona bilan aloqa — ota-ona chati orqali.
 */
export const TEACHER_HIDDEN_STUDENT_FIELDS = [
    'balance', 'paymentStatus', 'phone', 'parentPhone', 'phoneNorm', 'email', 'address',
    'telegramChatId', 'parentTelegramId', 'notes',
] as const;

export function projectStudentForTeacher<T>(row: T): T {
    if (!row || typeof row !== 'object') return row;
    const copy: any = { ...row };
    for (const f of TEACHER_HIDDEN_STUDENT_FIELDS) delete copy[f];
    return copy;
}
