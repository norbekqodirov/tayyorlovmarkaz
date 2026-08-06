/**
 * server/routes/payments.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Payme and Click Payment Webhook and Link Generation Router.
 */

import express from 'express';
import crypto from 'crypto';
import prisma from '../db.js';
import { todayDateStr } from '../utils/timezone.js';

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
                        await prisma.onlineTransaction.update({
                            where: { id: tx.id },
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

                    // Perform transaction
                    const performTime = new Date();
                    const updatedTx = await prisma.onlineTransaction.update({
                        where: { id: tx.id },
                        data: {
                            state: 2,
                            performAt: performTime
                        }
                    });

                    // Update Student Balance
                    const student = await prisma.student.findUnique({
                        where: { id: tx.studentId }
                    });

                    if (student) {
                        const newBalance = (student.balance || 0) + tx.amount;
                        const newPaymentStatus = newBalance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik';
                        await prisma.student.update({
                            where: { id: student.id },
                            data: {
                                balance: newBalance,
                                paymentStatus: newPaymentStatus
                            }
                        });

                        const todayStr = todayDateStr();

                        // Create Payment
                        await prisma.payment.create({
                            data: {
                                studentId: student.id,
                                amount: tx.amount,
                                method: 'Payme',
                                date: todayStr,
                                status: 'paid',
                                notes: `Payme transaction ID: ${txId}`
                            }
                        });

                        // Create Transaction log
                        await prisma.transaction.create({
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

                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: updatedTx.id,
                            perform_time: performTime.getTime(),
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
                    // Refund / Cancel performed transaction (state = 2 -> -2)
                    const updatedTx = await prisma.onlineTransaction.update({
                        where: { id: tx.id },
                        data: {
                            state: -2,
                            cancelAt: cancelTime,
                            reason
                        }
                    });

                    // Deduct from Student Balance
                    const student = await prisma.student.findUnique({
                        where: { id: tx.studentId }
                    });

                    if (student) {
                        const newBalance = (student.balance || 0) - tx.amount;
                        const newPaymentStatus = newBalance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik';
                        await prisma.student.update({
                            where: { id: student.id },
                            data: {
                                balance: newBalance,
                                paymentStatus: newPaymentStatus
                            }
                        });

                        const todayStr = todayDateStr();

                        // Create refund transaction log (expense)
                        await prisma.transaction.create({
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

                    return res.json({
                        jsonrpc: '2.0',
                        id,
                        result: {
                            transaction: updatedTx.id,
                            cancel_time: cancelTime.getTime(),
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
                const newTx = await prisma.onlineTransaction.create({
                    data: {
                        provider: 'click',
                        transactionId: String(click_trans_id),
                        amount: amountUZS,
                        studentId,
                        state: 1, // Completed
                        performAt: new Date()
                    }
                });

                // Apply balance update
                const newBalance = (student.balance || 0) + amountUZS;
                const newPaymentStatus = newBalance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik';
                await prisma.student.update({
                    where: { id: student.id },
                    data: {
                        balance: newBalance,
                        paymentStatus: newPaymentStatus
                    }
                });

                const todayStr = todayDateStr();

                // Create Payment
                await prisma.payment.create({
                    data: {
                        studentId: student.id,
                        amount: amountUZS,
                        method: 'Click',
                        date: todayStr,
                        status: 'paid',
                        notes: `Click transaction ID: ${click_trans_id}`
                    }
                });

                // Create Transaction log
                await prisma.transaction.create({
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

                return res.json({
                    click_trans_id,
                    merchant_trans_id,
                    merchant_confirm_id: newTx.id,
                    error: 0,
                    error_note: 'Success'
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

            // Transition state 0 (prepared) -> 1 (completed)
            await prisma.onlineTransaction.update({
                where: { id: tx.id },
                data: {
                    state: 1,
                    performAt: new Date()
                }
            });

            // Update student balance
            const newBalance = (student.balance || 0) + amountUZS;
            const newPaymentStatus = newBalance >= 0 ? 'Tolov qilingan' : 'Qarzdorlik';
            await prisma.student.update({
                where: { id: student.id },
                data: {
                    balance: newBalance,
                    paymentStatus: newPaymentStatus
                }
            });

            const todayStr = todayDateStr();

            // Create Payment
            await prisma.payment.create({
                data: {
                    studentId: student.id,
                    amount: amountUZS,
                    method: 'Click',
                    date: todayStr,
                    status: 'paid',
                    notes: `Click transaction ID: ${click_trans_id}`
                }
            });

            // Create Transaction log
            await prisma.transaction.create({
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

router.get('/generate-links', async (req, res) => {
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
