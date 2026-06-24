/**
 * KanbanBoard.tsx
 * Drag-and-drop kanban board for lead stages.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Phone, History, AlertCircle, Clock } from 'lucide-react';
import { STAGES, getStatusColor } from './types';
import type { Lead } from './types';

interface Props {
  leads: Lead[];
  onDrop: (e: React.DragEvent, stageId: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onLeadClick: (lead: Lead) => void;
}

const KanbanBoard: React.FC<Props> = ({ leads, onDrop, onDragStart, onLeadClick }) => (
  <div className="flex-1 overflow-x-auto pb-4">
    <div className="flex gap-6 min-w-max h-full">
      {STAGES.map(stage => (
        <div
          key={stage.id}
          className="w-80 flex flex-col bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4"
          onDragOver={e => e.preventDefault()}
          onDrop={e => onDrop(e, stage.id)}
        >
          {/* Column header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${stage.color}`} />
              <h3 className="font-black text-slate-900 dark:text-white tracking-tight">{stage.name}</h3>
            </div>
            <span className="bg-white dark:bg-zinc-800 text-zinc-500 text-[10px] font-black px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm">
              {leads.filter(l => l.stage === stage.id).length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {leads.filter(l => l.stage === stage.id).map(lead => {
              const daysOld = Math.floor((Date.now() - new Date(lead.date || Date.now()).getTime()) / 86400000);
              const pending = lead.stage !== 'won' && lead.stage !== 'lost';
              const isStale = pending && daysOld >= 7;
              const needsFollowUp = pending && daysOld >= 3 && daysOld < 7;

              const ringClass = isStale
                ? 'ring-2 ring-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)] border-transparent'
                : needsFollowUp
                  ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] border-transparent'
                  : 'hover:border-blue-500 dark:hover:border-blue-500';

              return (
                <motion.div
                  key={lead.id}
                  layoutId={lead.id}
                  draggable
                  onDragStartCapture={e => onDragStart(e as any, lead.id)}
                  onClick={() => onLeadClick(lead)}
                  className={`bg-white dark:bg-zinc-800 p-4 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing transition-all group relative overflow-hidden ${ringClass}`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full ${stage.color}`} />

                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white tracking-tight">{lead.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{lead.course}</p>
                        {isStale && (
                          <span className="flex items-center gap-1 text-[9px] font-black text-rose-500 uppercase tracking-widest">
                            <AlertCircle size={10} /> O'lik Lid
                          </span>
                        )}
                        {needsFollowUp && (
                          <span className="flex items-center gap-1 text-[9px] font-black text-amber-500 uppercase tracking-widest">
                            <Clock size={10} /> Qayta aloqa
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${getStatusColor(lead.status)}`}>
                      {lead.status}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                      <Phone size={12} className="text-zinc-400" /> {lead.phone}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-700/50">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-[10px] font-black text-zinc-400">
                          {lead.score}
                        </div>
                        <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${lead.score}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                        <History size={10} /> {(lead.activities || []).length}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default KanbanBoard;
