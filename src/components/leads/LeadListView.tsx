/**
 * LeadListView.tsx
 * Table/list view alternative to the kanban board.
 */
import React from 'react';
import { Edit2 } from 'lucide-react';
import { STAGES, getStatusColor } from './types';
import type { Lead } from './types';

interface Props {
  leads: Lead[];
  onRowClick: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
}

const LeadListView: React.FC<Props> = ({ leads, onRowClick, onEdit }) => (
  <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-black uppercase tracking-widest text-[10px]">
          <tr>
            <th className="px-6 py-4">Lid</th>
            <th className="px-6 py-4">Kurs</th>
            <th className="px-6 py-4">Bosqich</th>
            <th className="px-6 py-4">Holat</th>
            <th className="px-6 py-4">Manba</th>
            <th className="px-6 py-4 text-right">Amallar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
          {leads.map(lead => (
            <tr
              key={lead.id}
              onClick={() => onRowClick(lead)}
              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-black text-zinc-500">
                    {(lead.name || '?').charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 dark:text-white tracking-tight">{lead.name || 'Nomsiz Lid'}</p>
                    <p className="text-xs font-bold text-zinc-500">{lead.phone || "Telefon yo'q"}</p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 font-bold text-zinc-600 dark:text-zinc-400">{lead.course || '-'}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${STAGES.find(s => s.id === lead.stage)?.color || 'bg-zinc-400'}`} />
                  <span className="font-bold">{STAGES.find(s => s.id === lead.stage)?.name || "Noma'lum"}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">
                  {lead.source}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  onClick={e => { e.stopPropagation(); onEdit(lead); }}
                  className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                >
                  <Edit2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default LeadListView;
