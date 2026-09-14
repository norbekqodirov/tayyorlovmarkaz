/**
 * server/routes/payments.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Payme and Click Payment Webhook and Link Generation Router.
 */

import express from 'express';
import crypto from 'crypto';
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Helper: MD5 hashing for Click
function md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

// ─── PAYME INTEGRATION (JSON-RPC 2.0) ────────────────────────────────────────

const PAYME_SECRET_KEY = process.env.PAYME_SECRET_KEY || '';

router.post('/payme', async (req, res) => {
    const { method, params, id } = req.body;

    // 1. Authorization header check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.json({
            jsonrpc: '2.0',
            id,
            error: {
                code: -32504,
                message: 'Insufficient privilege (No basic auth)'
            }
        });
    }

    const base64Auth = authHeader.substring(6);
    const decoded = Buffer.from(base64Auth, 'base64').toString('ascii');
    const [, password] = decoded.split(':');

    // In Payme, the merchant key from .env must match the basic auth password
    if (!PAYME_SECRET_KEY || password !== PAYME_SECRET_KEY) {
        return res.json({
            jsonrpc: '2.0',
            id,
            error: {
                code: -32504,
                message: 'Insufficient privilege (Invalid credentials)'
            }
        });
    }

    try {
        switch (method) {
            case 'CheckPerformTransaction': {
                const studentId = params?.account?.student_id;
                const amountTiyin = params?.amount;

                if (!studentId) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31050,
                            message: 'Account not found (student_id missing)'
                        }
                    });
                }

                if (!amountTiyin || typeof amountTiyin !== 'number' || amountTiyin <= 0) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31001,
                            message: 'Incorrect amount'
                        }
                    });
                }

                // Check student existence
                const student = await prisma.student.findUnique({
                    where: { id: studentId }
                });

                if (!student) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31050,
                            message: 'Student not found',
                            data: 'student_id'
                        }
                    });
                }

                return res.json({
                    jsonrpc: '2.0',
                    id,
                    result: { allow: true }
                });
            }

            case 'CreateTransaction': {
                const txId = params?.id;
                const studentId = params?.account?.student_id;
                const amountTiyin = params?.amount;
                const time = params?.time;

                if (!txId || !studentId || !amountTiyin || !time) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Missing transaction parameters'
                        }
                    });
                }

                const amountUZS = amountTiyin / 100;

                // Validate student
                const student = await prisma.student.findUnique({
                    where: { id: studentId }
                });
                if (!student) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31050,
                            message: 'Student not found',
                            data: 'student_id'
                        }
                    });
                }

                // Check existing transaction
                const existingTx = await prisma.onlineTransaction.findUnique({
                    where: { transactionId: txId }
                });

                if (existingTx) {
                    // Check if state is created (1)
                    if (existingTx.state === 1) {
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            result: {
                                create_time: existingTx.createdAt.getTime(),
                                transaction: existingTx.id,
                                state: 1
                            }
                        });
                    } else {
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            error: {
                                code: -31051,
                                message: 'Transaction state is invalid'
                            }
                        });
                    }
                }

                // Check if student has another active transaction
                const activeTx = await prisma.onlineTransaction.findFirst({
                    where: {
                        studentId,
                        provider: 'payme',
                        state: 1
                    }
                });

                if (activeTx) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31051,
                            message: 'Another active transaction exists for this student'
                        }
                    });
                }

                // Create transaction in pending state (1)
                const newTx = await prisma.onlineTransaction.create({
                    data: {
                        provider: 'payme',
                        transactionId: txId,
                        amount: amountUZS,
                        studentId,
                        state: 1,
                        createdAt: new Date(time)
                    }
                });

                return res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        create_time: newTx.createdAt.getTime(),
                        transaction: newTx.id,
                        state: 1
                    }
                });
            }

            case 'PerformTransaction': {
                const txId = params?.id;
                if (!txId) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Missing transaction id'
                        }
                    });
                }

                const tx = await prisma.onlineTransaction.findUnique({
                    where: { transactionId: txId }
                });

                if (!tx) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Transaction not found'
                        }
                    });
                }

                if (tx.state === 1) {
                    // Check if expired (e.g. 12 hours)
                    const now = new Date();
                    const diffMs = now.getTime() - tx.createdAt.getTime();
                    if (diffMs > 12 * 60 * 60 * 1000) {
                        await prisma.onlineTransaction.updateMany({
                            where: { id: tx.id, state: 1 },
                            data: {
                                state: -1,
                                cancelAt: now,
                                reason: 4 // Timeout reason
                            }
                        });
                        return res.json({
                            jsonrpc: '2.0',
                            id,
                            error: {
                                code: -31008,
                                message: 'Transaction expired'
                            }
                        });
                    }

                    // FIN-02 tuzatish: ilgari state'ni 2'ga o'tkazish, balansni
                    // o'qib-yozish va Payment/Transaction yaratish 4 ta ALOHIDA
                    // so'rov edi — Payme'ning o'zi tavsiya qiladigan retry/parallel
                    // chaqiruvda (masalan tarmoq javobi yo'qolib, Payme qayta
                    // yuborsa) ikkalasi ham `tx.state === 1`ni ko'rib, balansni
                    // IKKI MARTA kreditlashi mumkin edi. Endi state o'tishi
                    // `updateMany({state:1})` bilan sharti bilan (poyga holatisiz)
                    // va balans+Payment+Transaction bitta $transaction ichida.
                    const performTime = new Date();
                    const result = await prisma.$transaction(async (txClient) => {
                        const { count } = await txClient.onlineTransaction.updateMany({
                            where: { id: tx.id, state: 1 },
                            data: { state: 2, performAt: performTime },
                        });
                        const current = await txClient.onlineTransaction.findUnique({ where: { id: tx.id } });
                        if (count === 0) return { applied: false, current };

                        const student = await txClient.student.findUnique({ where: { id: tx.studentId } });
                        if (student) {
                            const updated = await txClient.student.update({
                                where: { id: student.id },
                                data: { balance: { increment: tx.amount } },
                            });
                            await txClient.student.update({
                                where: { id: student.id },
                                data: { paymentStatus: updated.balance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik' },
                            });

                            const todayStr = todayDateStr();
                            await txClient.payment.create({
                                data: {
                                    studentId: student.id,
                                    amount: tx.amount,
                                    method: 'Payme',
                                    date: todayStr,
                                    status: 'paid',
                                    notes: `Payme transaction ID: ${txId}`
                                }
                            });
                            await txClient.transaction.create({
                                data: {
                                    type: 'income',
                                    amount: tx.amount,
                                    category: "Kurs to'lovi",
                                    description: `Payme orqali to'lov (ID: ${txId})`,
                                    date: todayStr,
                                    method: 'Bank',
                                    studentId: student.id,
                                    studentName: student.name
                                }
                            });
                        }
                        return { applied: true, current };
                    });

                    // count===0 bo'lsa — parallel so'rov allaqachon bajargan;
                    // Payme spetsifikatsiyasi bo'yicha bir xil (idempotent) natija
                    // qaytariladi, balans qayta kreditlanmaydi.
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: tx.id,
                            perform_time: result.current?.performAt?.getTime() ?? performTime.getTime(),
                            state: 2
                        }
                    });
                } else if (tx.state === 2) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: tx.id,
                            perform_time: tx.performAt ? tx.performAt.getTime() : tx.createdAt.getTime(),
                            state: 2
                        }
                    });
                } else {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31051,
                            message: 'Cannot perform transaction in this state'
                        }
                    });
                }
            }

            case 'CancelTransaction': {
                const txId = params?.id;
                const reason = params?.reason;

                if (!txId || reason === undefined) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Missing parameters'
                        }
                    });
                }

                const tx = await prisma.onlineTransaction.findUnique({
                    where: { transactionId: txId }
                });

                if (!tx) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Transaction not found'
                        }
                    });
                }

                const cancelTime = new Date();

                if (tx.state === 1) {
                    // Cancel created transaction (state = 1 -> -1)
                    const updatedTx = await prisma.onlineTransaction.update({
                        where: { id: tx.id },
                        data: {
                            state: -1,
                            cancelAt: cancelTime,
                            reason
                        }
                    });

                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: updatedTx.id,
                            cancel_time: cancelTime.getTime(),
                            state: -1
                        }
                    });
                } else if (tx.state === 2) {
                    // FIN-02 tuzatish: state o'tishi + balansdan yechish + xarajat
                    // yozuvi endi bitta atomar $transaction, state o'tishi esa
                    // updateMany({state:2}) sharti bilan — parallel Cancel
                    // chaqiruvi balansni ikki marta kamaytira olmaydi.
                    const result = await prisma.$transaction(async (txClient) => {
                        const { count } = await txClient.onlineTransaction.updateMany({
                            where: { id: tx.id, state: 2 },
                            data: { state: -2, cancelAt: cancelTime, reason },
                        });
                        const current = await txClient.onlineTransaction.findUnique({ where: { id: tx.id } });
                        if (count === 0) return { current };

                        const student = await txClient.student.findUnique({ where: { id: tx.studentId } });
                        if (student) {
                            const updated = await txClient.student.update({
                                where: { id: student.id },
                                data: { balance: { decrement: tx.amount } },
                            });
                            await txClient.student.update({
                                where: { id: student.id },
                                data: { paymentStatus: updated.balance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik' },
                            });

                            const todayStr = todayDateStr();
                            await txClient.transaction.create({
                                data: {
                                    type: 'expense',
                                    amount: tx.amount,
                                    category: 'Qaytarish',
                                    description: `Payme to'lovi bekor qilindi (ID: ${txId})`,
                                    date: todayStr,
                                    method: 'Bank',
                                    studentId: student.id,
                                    studentName: student.name
                                }
                            });
                        }
                        return { current };
                    });

                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: tx.id,
                            cancel_time: result.current?.cancelAt?.getTime() ?? cancelTime.getTime(),
                            state: -2
                        }
                    });
                } else {
                    // Already canceled
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: tx.id,
                            cancel_time: tx.cancelAt ? tx.cancelAt.getTime() : tx.createdAt.getTime(),
                            state: tx.state
                        }
                    });
                }
            }

            case 'CheckTransaction': {
                const txId = params?.id;
                if (!txId) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Missing transaction id'
                        }
                    });
                }

                const tx = await prisma.onlineTransaction.findUnique({
                    where: { transactionId: txId }
                });

                if (!tx) {
                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        error: {
                            code: -31008,
                            message: 'Transaction not found'
                        }
                    });
                }

                return res.json({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        create_time: tx.createdAt.getTime(),
                        perform_time: tx.performAt ? tx.performAt.getTime() : 0,
                        cancel_time: tx.cancelAt ? tx.cancelAt.getTime() : 0,
                        transaction: tx.id,
                        state: tx.state,
                        reason: tx.reason
                    }
                });
            }

            default:
                return res.json({
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: -32601,
                        message: 'Method not found'
                    }
                });
        }
    } catch (error: any) {
        console.error('[Payme Webhook Error]:', error);
        return res.json({
            jsonrpc: '2.0',
            id,
            error: {
                code: -31008,
                message: 'Internal system error'
            }
        });
    }
});

// ─── CLICK INTEGRATION (Prepare / Complete) ──────────────────────────────────

const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID || '';
const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || '';
const CLICK_SECRET_KEY = process.env.CLICK_SECRET_KEY || '';

router.post('/click', async (req, res) => {
    // Click might send data in URL-encoded format, so we access body properties
    const {
        click_trans_id,
        service_id,
        click_paydoc_id,
        merchant_trans_id, // studentId
        amount,
        action, // 0 = Prepare, 1 = Complete
        error,
        error_note,
        sign_time,
        sign_string,
        merchant_prepare_id
    } = req.body;

    // Validate request integrity using signature
    // Formula: click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time
    const calculatedString = `${click_trans_id}${service_id}${CLICK_SECRET_KEY}${merchant_trans_id}${amount}${action}${sign_time}`;
    const calculatedHash = md5(calculatedString);

    if (calculatedHash !== sign_string) {
        return res.json({
            error: -1,
            error_note: 'Signature verification failed'
        });
    }

    // FIN-02 tuzatish: service_id konfiguratsiya bilan solishtirilmagan edi.
    // Imzo formulasi service_id'ni ham o'z ichiga oladi, shuning uchun imzo
    // to'g'ri bo'lishi uchun baribir CLICK_SECRET_KEY bilinishi kerak — bu
    // aniq tekshiruv qo'shimcha himoya qatlami (masalan bir nechta xizmat
    // bir xil secret bilan sozlangan holatlar uchun).
    if (CLICK_SERVICE_ID && String(service_id) !== String(CLICK_SERVICE_ID)) {
        return res.json({
            error: -1,
            error_note: 'Invalid service_id'
        });
    }

    // Handle Click Errors
    if (error && Number(error) < 0) {
        // If transaction has failed at Click, we log it and cancel if prepared
        if (click_trans_id) {
            await prisma.onlineTransaction.updateMany({
                where: { transactionId: String(click_trans_id) },
                data: {
                    state: 2, // Click cancel code
                    cancelAt: new Date()
                }
            });
        }
        return res.json({
            error: 0,
            error_note: 'Error received and logged'
        });
    }

    try {
        const studentId = merchant_trans_id;
        const amountUZS = Number(amount);

        // Find Student
        const student = await prisma.student.findUnique({
            where: { id: studentId }
        });

        if (!student) {
            return res.json({
                error: -5,
                error_note: 'Student not found'
            });
        }

        // Action = 0: Prepare
        if (Number(action) === 0) {
            // Check if transaction already exists
            const existingTx = await prisma.onlineTransaction.findUnique({
                where: { transactionId: String(click_trans_id) }
            });

            if (existingTx) {
                return res.json({
                    click_trans_id,
                    merchant_trans_id,
                    merchant_prepare_id: existingTx.id,
                    error: 0,
                    error_note: 'Success'
                });
            }

            // Create transaction in Prepare state (state: 0)
            const newTx = await prisma.onlineTransaction.create({
                data: {
                    provider: 'click',
                    transactionId: String(click_trans_id),
                    amount: amountUZS,
                    studentId,
                    state: 0
                }
            });

            return res.json({
                click_trans_id,
                merchant_trans_id,
                merchant_prepare_id: newTx.id,
                error: 0,
                error_note: 'Success'
            });
        }

        // Action = 1: Complete
        if (Number(action) === 1) {
            const tx = await prisma.onlineTransaction.findUnique({
                where: { transactionId: String(click_trans_id) }
            });

            if (!tx) {
                // If Complete is sent without Prepare, some integrations support it, but Click standard is Prepare first.
                // Let's create and complete directly.
                // FIN-02 tuzatish: transactionId unique bo'lgani uchun parallel
                // ikkinchi so'rov create()da P2002 bilan xato beradi (tashqi
                // catch orqali ushlanadi) — bu balansni ikki marta kreditlashni
                // oldini oladi. Balans+Payment+Transaction esa bitta $transaction.
                const todayStr = todayDateStr();
                const created = await prisma.$transaction(async (txClient) => {
                    const newTx = await txClient.onlineTransaction.create({
                        data: {
                            provider: 'click',
                            transactionId: String(click_trans_id),
                            amount: amountUZS,
                            studentId,
                            state: 1, // Completed
                            performAt: new Date()
                        }
                    });

                    const updated = await txClient.student.update({
                        where: { id: student.id },
                        data: { balance: { increment: amountUZS } },
                    });
                    await txClient.student.update({
                        where: { id: student.id },
                        data: { paymentStatus: updated.balance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik' },
                    });
                    await txClient.payment.create({
                        data: {
                            studentId: student.id,
                            amount: amountUZS,
                            method: 'Click',
                            date: todayStr,
                            status: 'paid',
                            notes: `Click transaction ID: ${click_trans_id}`
                        }
                    });
                    await txClient.transaction.create({
                        data: {
                            type: 'income',
                            amount: amountUZS,
                            category: "Kurs to'lovi",
                            description: `Click orqali to'lov (ID: ${click_trans_id})`,
                            date: todayStr,
                            method: 'Bank',
                            studentId: student.id,
                            studentName: student.name
                        }
                    });
                    return newTx;
                });

                return res.json({
                    click_trans_id,
                    merchant_trans_id,
                    merchant_confirm_id: created.id,
                    error: 0,
                    error_note: 'Success'
                });
            }

            // FIN-02 tuzatish: merchant_prepare_id yuborilgan bo'lsa, aynan shu
            // Prepare bosqichiga tegishli ekanini tekshiramiz (ilgari olinardi,
            // lekin hech qachon solishtirilmasdi).
            if (merchant_prepare_id && String(merchant_prepare_id) !== tx.id) {
                return res.json({
                    click_trans_id,
                    merchant_trans_id,
                    error: -6,
                    error_note: 'Transaction does not match prepare id'
                });
            }

            if (tx.state === 1) {
                // Already completed
                return res.json({
                    click_trans_id,
                    merchant_trans_id,
                    merchant_confirm_id: tx.id,
                    error: 0,
                    error_note: 'Success'
                });
            }

            if (tx.state === 2) {
                // Bekor qilingan/xatolik bo'lgan tranzaksiya — Complete qayta yuborilsa ham
                // hisobni kreditlab bo'lmaydi (Payme filiali PerformTransaction'da xuddi shu
                // holat uchun else-if bor edi, Click filialida yo'q edi — shu yerda tuzatildi).
                return res.json({
                    click_trans_id,
                    merchant_trans_id,
                    error: -9,
                    error_note: 'Transaction cancelled'
                });
            }

            // FIN-02 tuzatish: state o'tishi (0->1) + balans + Payment/Transaction
            // endi bitta atomar $transaction, state o'tishi esa
            // updateMany({state:0}) sharti bilan — parallel Complete chaqiruvi
            // balansni ikki marta kreditlay olmaydi.
            const todayStr = todayDateStr();
            const result = await prisma.$transaction(async (txClient) => {
                const { count } = await txClient.onlineTransaction.updateMany({
                    where: { id: tx.id, state: 0 },
                    data: { state: 1, performAt: new Date() },
                });
                if (count === 0) return { applied: false };

                const updated = await txClient.student.update({
                    where: { id: student.id },
                    data: { balance: { increment: amountUZS } },
                });
                await txClient.student.update({
                    where: { id: student.id },
                    data: { paymentStatus: updated.balance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik' },
                });
                await txClient.payment.create({
                    data: {
                        studentId: student.id,
                        amount: amountUZS,
                        method: 'Click',
                        date: todayStr,
                        status: 'paid',
                        notes: `Click transaction ID: ${click_trans_id}`
                    }
                });
                await txClient.transaction.create({
                    data: {
                        type: 'income',
                        amount: amountUZS,
                        category: "Kurs to'lovi",
                        description: `Click orqali to'lov (ID: ${click_trans_id})`,
                        date: todayStr,
                        method: 'Bank',
                        studentId: student.id,
                        studentName: student.name
                    }
                });
                return { applied: true };
            });

            // count===0 bo'lsa (parallel so'rov allaqachon bajargan) ham,
            // Click'ga baribir muvaffaqiyatli (idempotent) javob qaytariladi —
            // faqat balans qayta kreditlanmaydi.
            void result;
            return res.json({
                click_trans_id,
                merchant_trans_id,
                merchant_confirm_id: tx.id,
                error: 0,
                error_note: 'Success'
            });
        }

        return res.json({
            error: -3,
            error_note: 'Action not found'
        });
    } catch (e: any) {
        console.error('[Click Webhook Error]:', e);
        return res.json({
            error: -7,
            error_note: 'Failed to update state'
        });
    }
});

// ─── PAYMENT LINK GENERATOR ──────────────────────────────────────────────────

router.get('/generate-links', requireAuth, async (req, res) => {
    const studentId = req.query.studentId as string;
    const amount = Number(req.query.amount);

    if (!studentId || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Valid studentId and amount are required' });
    }

    try {
        const student = await prisma.student.findUnique({
            where: { id: studentId }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID || '';
        const CLICK_SERVICE_ID = process.env.CLICK_SERVICE_ID || '';
        const CLICK_MERCHANT_ID = process.env.CLICK_MERCHANT_ID || '';

        // Generate Payme Link
        // Payme expects amount in tiyins (1 UZS = 100 tiyins)
        // Format: m=<merchant_id>;ac.student_id=<student_id>;a=<amount_tiyins>
        const paymePayload = `m=${PAYME_MERCHANT_ID};ac.student_id=${studentId};a=${amount * 100}`;
        const paymeBase64 = Buffer.from(paymePayload).toString('base64');
        const paymeLink = `https://checkout.paycom.uz/${paymeBase64}`;

        // Generate Click Link
        // Format: https://my.click.uz/services/pay?service_id=<service_id>&merchant_id=<merchant_id>&amount=<amount>&transaction_param=<student_id>
        const clickLink = `https://my.click.uz/services/pay?service_id=${CLICK_SERVICE_ID}&merchant_id=${CLICK_MERCHANT_ID}&amount=${amount}&transaction_param=${studentId}`;

        res.json({
            payme: paymeLink,
            click: clickLink
        });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to generate payment links' });
    }
});

export default router;
