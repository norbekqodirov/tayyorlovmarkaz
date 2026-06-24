import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    FileBarChart2, Download, RefreshCw, Loader2, TrendingUp,
    TrendingDown, Users, Wallet, ClipboardCheck, Target,
    Calendar, BarChart2,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useToast } from '../../components/Toast';
import api from '../../api/client';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const fmt = (n: number) => n >= 1_000_000
    ? (n / 1_000_000).toFixed(1) + 'M'
    : n >= 1_000 ? (n / 1_000).toFixed(0) + 'K' : String(n);

export default function CrmReports() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/reports/summary?from=${fromDate}&to=${toDate}`);
            setData(res.data);
        } catch {
            showToast("Hisobot yuklanmadi", 'error');
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => { load(); }, [load]);

    const exportReport = () => {
        if (!data) return;
        const rows = [
            ['Hisobot davri', `${fromDate} — ${toDate}`],
            [],
            ['Moliya', ''],
            ['Daromad', data.finance?.income ?? 0],
            ['Xarajat', data.finance?.expense ?? 0],
            ['Foyda', (data.finance?.income ?? 0) - (data.finance?.expense ?? 0)],
            [],
            ["O'quvchilar", ''],
            ['Yangi', data.students?.new ?? 0],
            [],
            ['Davomat', ''],
            ['Davomat %', data.attendance?.rate ?? 0],
            [],
            ['Lidlar', ''],
            ['Yangi lidlar', data.leads?.new ?? 0],
            ['Yutilgan', data.leads?.won ?? 0],
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `hisobot_${fromDate}_${toDate}.csv`; a.click();
        URL.revokeObjectURL(url);
        showToast('CSV yuklab olindi', 'success');
    };

    const summary = [
        { label: 'Daromad', value: fmt(data?.finance?.income ?? 0) + ' so\'m', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        { label: 'Xarajat', value: fmt(data?.finance?.expense ?? 0) + ' so\'m', icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
        { label: "Yangi o'quvchi", value: data?.students?.new ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
        { label: 'Davomat', value: (data?.attendance?.rate ?? 0) + '%', icon: ClipboardCheck, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
        { label: 'Yangi lid', value: data?.leads?.new ?? 0, icon: Target, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        { label: 'Konversiya', value: (data?.leads?.new ?? 0) > 0 ? Math.round(((data?.leads?.won ?? 0) / data.leads.new) * 100) + '%' : '0%', icon: BarChart2, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    ];

    const incomeByCategory = data?.finance?.incomeByCategory
        ? Object.entries(data.finance.incomeByCategory).map(([name, value]) => ({ name, value: Number(value) }))
        : [];
    const expenseByCategory = data?.finance?.expenseByCategory
        ? Object.entries(data.finance.expenseByCategory).map(([name, value]) => ({ name, value: Number(value) }))
        : [];
    const sourceData = data?.students?.bySources
        ? Object.entries(data.students.bySources).map(([name, value]) => ({ name, value: Number(value) }))
        : [];

    return (
        <div className="p-6 space-y-5 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <FileBarChart2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Hisobotlar</h1>
                        <p className="text-xs text-zinc-400">Davr bo'yicha umumiy tahlil</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                        className="px-3 py-2 text-sm rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                    <span className="text-zinc-400 text-sm">—</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                        className="px-3 py-2 text-sm rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                    <button onClick={load} className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                        <RefreshCw size={15} />
                    </button>
                    <button onClick={exportReport} disabled={!data}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
                        <Download size={14} /> CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
                    {/* Summary grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {summary.map((s, i) => (
                            <div key={i} className={`rounded-2xl border border-transparent p-4 ${s.bg}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <s.icon size={14} className={s.color} />
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{s.label}</span>
                                </div>
                                <p className="text-xl font-black text-zinc-900 dark:text-zinc-100">{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Charts row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Income by category */}
                        {incomeByCategory.length > 0 && (
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Wallet size={14} className="text-emerald-500" />
                                    <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Daromad kategoriyasi</p>
                                </div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie data={incomeByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                            {incomeByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(v: any) => fmt(v) + " so'm"} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Source breakdown */}
                        {sourceData.length > 0 && (
                            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <Users size={14} className="text-blue-500" />
                                    <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">O'quvchi manbalari</p>
                                </div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={sourceData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <Tooltip />
                                        <Bar dataKey="value" name="O'quvchilar" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* Expense breakdown */}
                    {expenseByCategory.length > 0 && (
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <TrendingDown size={14} className="text-red-500" />
                                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Xarajat kategoriyasi</p>
                            </div>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={expenseByCategory} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmt(v)} />
                                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} />
                                    <Tooltip formatter={(v: any) => fmt(v) + " so'm"} />
                                    <Bar dataKey="value" name="Xarajat" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Period info */}
                    <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 flex items-center gap-3">
                        <Calendar size={14} className="text-zinc-400" />
                        <p className="text-xs text-zinc-500">
                            Hisobot davri: <span className="font-bold text-zinc-700 dark:text-zinc-300">{data?.period?.from}</span> dan <span className="font-bold text-zinc-700 dark:text-zinc-300">{data?.period?.to}</span> gacha
                        </p>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
