import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Target, BookOpen, Presentation, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFirestore } from '../hooks/useFirestore';
import { motion, AnimatePresence } from 'framer-motion';

export default function GlobalSearch({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const { data: students = [] } = useFirestore<any>('students');
    const { data: leads = [] } = useFirestore<any>('leads');
    const { data: teachers = [] } = useFirestore<any>('teachers');
    const { data: courses = [] } = useFirestore<any>('courses');

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            setQuery('');
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                if (isOpen) onClose();
                else {
                    // Trigger handled in CrmLayout instead, but we can do it here if mounted globally
                }
            }
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const results = React.useMemo(() => {
        if (!query.trim()) return [];

        const term = query.toLowerCase();
        const matches = [];

        // Search Students
        const matchedStudents = (students || []).filter((s: any) => s.name?.toLowerCase().includes(term) || s.phone?.includes(term));
        matches.push(...matchedStudents.map((s: any) => ({ id: s.id, title: s.name, subtitle: s.phone, type: 'student', icon: User, path: '/crmtayyorlovmarkaz/students' })));

        // Search Leads
        const matchedLeads = (leads || []).filter((l: any) => l.name?.toLowerCase().includes(term) || l.phone?.includes(term));
        matches.push(...matchedLeads.map((l: any) => ({ id: l.id, title: l.name, subtitle: `${l.source} - ${l.course}`, type: 'lead', icon: Target, path: '/crmtayyorlovmarkaz/leads' })));

        // Search Teachers
        const matchedTeachers = (teachers || []).filter((t: any) => t.name?.toLowerCase().includes(term) || t.subjects?.join(' ').toLowerCase().includes(term));
        matches.push(...matchedTeachers.map((t: any) => ({ id: t.id, title: t.name, subtitle: t.subjects?.join(', '), type: 'teacher', icon: Presentation, path: '/crmtayyorlovmarkaz/teachers' })));

        // Search Courses
        const matchedCourses = (courses || []).filter((c: any) => c.title?.toLowerCase().includes(term));
        matches.push(...matchedCourses.map((c: any) => ({ id: c.id, title: c.title, subtitle: c.duration, type: 'course', icon: BookOpen, path: '/crmtayyorlovmarkaz/courses' })));

        return matches.slice(0, 8); // top 8
    }, [query, students, leads, teachers, courses]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] bg-zinc-900/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{ duration: 0.15 }}
                    className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
                >
                    {/* Search Input */}
                    <div className="flex items-center px-4 border-b border-zinc-200 dark:border-zinc-800">
                        <Search className="text-zinc-400" size={24} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Qidirish... (O'quvchilar, Lidlar, Ustozlar, Kurslar)"
                            className="flex-1 bg-transparent px-4 py-6 text-lg font-medium text-slate-900 dark:text-white outline-none placeholder:text-zinc-400"
                        />
                        <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Results */}
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                        {!query.trim() ? (
                            <div className="py-12 text-center text-zinc-500 font-medium">
                                Siz izlagan barcha narsa shu yerda. Qidirishni boshlang...
                            </div>
                        ) : results.length > 0 ? (
                            <div className="space-y-1">
                                {results.map((item, i) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={`${item.type}-${item.id}`}
                                            onClick={() => {
                                                navigate(item.path);
                                                onClose();
                                            }}
                                            className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group text-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.type === 'student' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    item.type === 'lead' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                                        item.type === 'teacher' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                                                            'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                    }`}>
                                                    <Icon size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 dark:text-white">{item.title}</p>
                                                    <p className="text-xs text-zinc-500">{item.subtitle}</p>
                                                </div>
                                            </div>
                                            <div className="hidden group-hover:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                                                {item.type}
                                                <ArrowRight size={14} className="text-blue-500" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-12 text-center">
                                <p className="text-zinc-500 font-medium mb-1">Hech narsa topilmadi</p>
                                <p className="text-xs text-zinc-400">Boshqa so'z bilan izlab ko'ring</p>
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-4 text-xs font-medium text-zinc-500">
                        <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px] font-black">Esc</kbd> Yopish</span>
                        <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px] font-black">↑↓</kbd> Harakatlanish</span>
                        <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px] font-black">↵</kbd> Tanlash</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
