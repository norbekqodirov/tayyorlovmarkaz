/**
 * KanbanBoard.tsx
 * Drag-and-drop kanban board for lead stages.
 *
 * Tuzatilgan buglar:
 * - "O'lik lid" halqasi endi lastContactAt'dan hisoblanadi (avval faqat
 *   yaratilish sanasidan — bugun qo'ng'iroq qilingan lid ham "o'lik" ko'rinardi).
 * - Drag'dan keyingi tasodifiy klik (detail panelni ochib yuborardi) — endi
 *   pointer harakati kuzatiladi.
 * - Mobil uchun (HTML5 DnD ishlamaydi) — kartada bosqich select'i bor.
 */
import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, History, AlertCircle, Clock, User, CalendarClock } from 'lucide-react';
import { STAGES, getStatusColor } from './types';
import type { Lead } from './types';

interface Props {
  leads: Lead[];
  stageCounts: Record<string, number>;
  onDrop: (id: string, stageId: string) => void;
  onLeadClick: (lead: Lead) => void;
  onStageChange: (id: string, stageId: string) => void;
}

function LeadCard({ lead, onLeadClick, onStageChange }: { lead: Lead; onLeadClick: (l: Lead) => void; onStageChange: (id: string, stage: string) => void }) {
  const dragMoved = useRef(false);
  const stage = STAGES.find(s => s.id === lead.stage) || STAGES[0];

  const refDate = lead.lastContactAt || lead.createdAt || lead.date;
  const daysOld = Math.floor((Date.now() - new Date(refDate || Date.now()).getTime()) / 86400000);
  const pending = lead.stage !== 'won' && lead.stage !== 'lost';
  const isStale = pending && daysOld >= 7;
  const needsFollowUp = pending && daysOld >= 3 && daysOld < 7;
  const overdue = pending && lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < Date.now();
  const noResponse = pending && !lead.firstResponseAt;

  const ringClass = isStale
    ? 'ring-2 ring-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] border-transparent'
    : needsFollowUp
      ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] border-transparent'
      : 'hover:border-blue-500 dark:hover:border-blue-500';

  return (
    <motion.div
      layoutId={lead.id}
      draggable
      onDragStartCapture={e => {
        dragMoved.current = true;
        e.dataTransfer.setData('leadId', lead.id);
      }}
      onClick={() => { if (!dragMoved.current) onLeadClick(lead); dragMoved.current = false; }}
      className={`bg-white dark:bg-zinc-800 p-3 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing transition-all group relative ${ringClass}`}
    >
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0 flex items-start gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${stage.color}`} />
          <div className="min-w-0">
            <h4 className="font-black text-sm text-slate-900 dark:text-white tracking-tight truncate">{lead.name}</h4>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{lead.course}</p>
              {lead.source && (
                <span className="text-[9px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded">{lead.source}</span>
              )}
            </div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${getStatusColor(lead.status)}`}>
          {lead.status}
        </span>
      </div>

      {(isStale || needsFollowUp || overdue || noResponse) && (
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          {isStale && (
            <span className="flex items-center gap-1 text-[9px] font-black text-rose-500 uppercase tracking-widest">
              <AlertCircle size={10} /> O'lik Lid
            </span>
          )}
          {needsFollowUp && !isStale && (
            <span className="flex items-center gap-1 text-[9px] font-black text-amber-500 uppercase tracking-widest">
              <Clock size={10} /> Qayta aloqa
            </span>
          )}
          {overdue && (
            <span className="flex items-center gap-1 text-[9px] font-black text-rose-500 uppercase tracking-widest">
              <CalendarClock size={10} /> Muddat o'tdi
            </span>
          )}
          {noResponse && (
            <span className="flex items-center gap-1 text-[9px] font-black text-orange-500 uppercase tracking-widest">
              SLA
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-zinc-500">
        <span className="flex items-center gap-1 min-w-0 truncate">
          <Phone size={11} className="text-zinc-400 shrink-0" /> {lead.phone}
        </span>
        {lead.assignedTo && (
          <span className="flex items-center gap-1 min-w-0 truncate">
            <User size={11} className="text-zinc-400 shrink-0" /> {lead.assignedTo.name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-[9px] font-black text-zinc-400">
            {lead.score}
          </div>
          <div className="w-14 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${lead.score}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
          <History size={10} /> {lead._count?.activities ?? (lead.activities || []).length}
        </div>
      </div>

      {/* Mobil uchun — HTML5 drag ishlamaydi, shuning uchun bosqich select'i */}
      <select
        value={lead.stage}
        onClick={e => e.stopPropagation()}
        onChange={e => onStageChange(lead.id, e.target.value)}
        className="w-full sm:hidden mt-2 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-bold outline-none"
      >
        {STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </motion.div>
  );
}

const KanbanBoard: React.FC<Props> = ({ leads, stageCounts, onDrop, onLeadClick, onStageChange }) => {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-x-auto pb-4">
      <div className="flex gap-6 min-w-max h-full">
        {STAGES.map(stage => (
          <div
            key={stage.id}
            className={`w-80 flex flex-col bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border p-4 transition-colors ${
              dragOverStage === stage.id ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-500/5' : 'border-zinc-200 dark:border-zinc-800'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOverStage(stage.id); }}
            onDragLeave={() => setDragOverStage(prev => (prev === stage.id ? null : prev))}
            onDrop={e => {
              e.preventDefault();
              setDragOverStage(null);
              const id = e.dataTransfer.getData('leadId');
              if (id) onDrop(id, stage.id);
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                <h3 className="font-black text-slate-900 dark:text-white tracking-tight">{stage.name}</h3>
              </div>
              <span className="bg-white dark:bg-zinc-800 text-zinc-500 text-[10px] font-black px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm">
                {stageCounts[stage.id] ?? leads.filter(l => l.stage === stage.id).length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {leads.filter(l => l.stage === stage.id).map(lead => (
                <LeadCard key={lead.id} lead={lead} onLeadClick={onLeadClick} onStageChange={onStageChange} />
              ))}
              {leads.filter(l => l.stage === stage.id).length === 0 && (
                <div className="text-center py-8 text-zinc-300 dark:text-zinc-700 text-xs font-bold">Bo'sh</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KanbanBoard;
