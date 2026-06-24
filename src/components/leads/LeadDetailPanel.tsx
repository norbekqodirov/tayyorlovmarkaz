/**
 * LeadDetailPanel.tsx
 * Right-side slide-in panel showing full lead details, activity timeline, and note input.
 */
import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  X, Edit2, Trash2, Phone, Mail, Calendar, User,
  MessageSquare, Send, FileText, GraduationCap,
} from 'lucide-react';
import { getStatusColor } from './types';
import type { Lead, LeadActivity } from './types';

interface Props {
  lead: Lead;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
  onConvert: () => void;
  onAddActivity: (leadId: string, type: LeadActivity['type'], content: string) => void;
}

const LeadDetailPanel: React.FC<Props> = ({
  lead, onClose, onEdit, onDelete, onConvert, onAddActivity,
}) => {
  const noteRef = useRef<HTMLInputElement>(null);

  const submitNote = () => {
    if (noteRef.current?.value) {
      onAddActivity(lead.id, 'note', noteRef.current.value);
      noteRef.current.value = '';
    }
  };

  const activityIcon = (type: LeadActivity['type']) => {
    switch (type) {
      case 'call':    return <Phone size={14} className="text-blue-500" />;
      case 'message': return <MessageSquare size={14} className="text-emerald-500" />;
      case 'meeting': return <Calendar size={14} className="text-purple-500" />;
      case 'note':    return <FileText size={14} className="text-amber-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="w-full max-w-2xl h-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{lead.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${getStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{lead.course}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lead.stage === 'won' && (
              <button
                onClick={onConvert}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-600/20"
              >
                <GraduationCap size={16} /> O'quvchiga aylantirish
              </button>
            )}
            <button onClick={() => onEdit(lead)} className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"><Edit2 size={20} /></button>
            <button onClick={() => onDelete(lead.id)} className="p-2 text-zinc-400 hover:text-rose-600 transition-colors"><Trash2 size={20} /></button>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors ml-4"><X size={24} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Telefon</p>
              <a href={`tel:${lead.phone}`} className="text-sm font-bold text-blue-600 flex items-center gap-2">
                <Phone size={14} /> {lead.phone}
              </a>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Email</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail size={14} className="text-zinc-400" /> {lead.email || 'Kiritilmagan'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Manba</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{lead.source}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Qo'shilgan sana</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {new Date(lead.date).toLocaleDateString('uz-UZ')}
              </p>
            </div>
          </div>

          {/* Score bar */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Lid Balli (Score)</h3>
              <span className="text-2xl font-black text-blue-600">{lead.score}</span>
            </div>
            <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${lead.score}%` }}
                className="h-full bg-blue-600"
              />
            </div>
            <p className="text-[10px] font-bold text-zinc-500 mt-3 italic">
              * Ball lidning faolligi va qiziqishi asosida avtomatik hisoblanadi.
            </p>
          </div>

          {/* Activities timeline */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Faolliklar Tarixi</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => onAddActivity(lead.id, 'call', "Telefon orqali bog'lanildi")}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 hover:text-blue-600 transition-all"
                >
                  <Phone size={16} />
                </button>
                <button
                  onClick={() => onAddActivity(lead.id, 'message', 'Telegramdan xabar yozildi')}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 hover:text-blue-600 transition-all"
                >
                  <Send size={16} />
                </button>
                <button
                  onClick={() => onAddActivity(lead.id, 'meeting', "Uchrashuv o'tkazildi")}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 hover:text-blue-600 transition-all"
                >
                  <Calendar size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-100 dark:before:bg-zinc-800">
              {(lead.activities || []).map(activity => (
                <div key={activity.id} className="relative pl-10">
                  <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 flex items-center justify-center z-10">
                    {activityIcon(activity.type)}
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-xs font-black text-slate-900 dark:text-white">{activity.content}</p>
                      <span className="text-[10px] font-bold text-zinc-400">
                        {new Date(activity.date).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                      <User size={10} /> {activity.user} • {new Date(activity.date).toLocaleDateString('uz-UZ')}
                    </div>
                  </div>
                </div>
              ))}
              {(lead.activities || []).length === 0 && (
                <div className="pl-10 text-zinc-400 text-sm italic py-4">Hozircha faolliklar yo'q...</div>
              )}
            </div>
          </div>
        </div>

        {/* Note input footer */}
        <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex gap-3">
            <input
              ref={noteRef}
              type="text"
              placeholder="Eslatma yozish..."
              className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              onKeyDown={e => { if (e.key === 'Enter') submitNote(); }}
            />
            <button
              onClick={submitNote}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm shadow-lg shadow-blue-600/20"
            >
              Saqlash
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LeadDetailPanel;
