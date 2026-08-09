/**
 * LeadListView.tsx
 * Jadval ko'rinishi — mavjud ui/DataTable ustida (saralash, tanlash,
 * sahifalash, yuklanish/bo'sh holatlari tayyor).
 */
import React from 'react';
import { Edit2, CalendarClock } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { STAGES, getStatusColor } from './types';
import type { Lead } from './types';
import type { LeadSort } from '../../hooks/useLeads';

interface Props {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  sort: LeadSort;
  onSortChange: (s: LeadSort) => void;
  onPageChange: (p: number) => void;
  onRowClick: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  selection: { value: Set<string>; onChange: (s: Set<string>) => void };
}

const LeadListView: React.FC<Props> = ({ leads, total, page, limit, loading, sort, onSortChange, onPageChange, onRowClick, onEdit, selection }) => {
  const columns: DataTableColumn<Lead>[] = [
    {
      id: 'name', header: 'Lid', sortable: true, accessor: l => l.name,
      cell: (lead) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-black text-zinc-500 shrink-0">
            {(lead.name || '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 dark:text-white tracking-tight truncate">{lead.name || 'Nomsiz Lid'}</p>
            <p className="text-xs font-bold text-zinc-500">{lead.phone || "Telefon yo'q"}</p>
          </div>
        </div>
      ),
    },
    { id: 'course', header: 'Kurs', accessor: l => l.course, cell: l => <span className="font-bold text-zinc-600 dark:text-zinc-400">{l.course || '-'}</span> },
    {
      id: 'stage', header: 'Bosqich',
      cell: (lead) => {
        const s = STAGES.find(x => x.id === lead.stage);
        return (
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${s?.color || 'bg-zinc-400'}`} />
            <span className="font-bold">{s?.name || "Noma'lum"}</span>
          </div>
        );
      },
    },
    {
      id: 'status', header: 'Holat',
      cell: (lead) => (
        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getStatusColor(lead.status)}`}>{lead.status}</span>
      ),
    },
    { id: 'source', header: 'Manba', cell: l => <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg">{l.source}</span> },
    { id: 'assignee', header: 'Menejer', cell: l => <span className="text-xs font-bold text-zinc-500">{l.assignedTo?.name || <span className="italic text-zinc-300">Egasiz</span>}</span> },
    { id: 'score', header: 'Ball', sortable: true, align: 'center', accessor: l => l.score, cell: l => <span className="font-black text-slate-700 dark:text-zinc-300">{l.score}</span> },
    {
      id: 'nextFollowUpAt', header: 'Keyingi qadam', sortable: true, accessor: l => l.nextFollowUpAt,
      cell: (lead) => {
        if (!lead.nextFollowUpAt) return <span className="text-zinc-300">-</span>;
        const overdue = new Date(lead.nextFollowUpAt).getTime() < Date.now();
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-bold ${overdue ? 'text-rose-500' : 'text-zinc-500'}`}>
            <CalendarClock size={12} /> {new Date(lead.nextFollowUpAt).toLocaleDateString('uz-UZ')}
          </span>
        );
      },
    },
  ];

  return (
    <DataTable
      data={leads}
      columns={columns}
      rowId={l => l.id}
      loading={loading}
      selection={selection}
      serverSide
      sortBy={{ column: sort.column, direction: sort.dir }}
      onSortChange={(s) => { if (s.column && s.direction) onSortChange({ column: s.column as LeadSort['column'], dir: s.direction }); }}
      pagination={{ page, pageSize: limit || 25, total, onPageChange }}
      onRowClick={onRowClick}
      rowActions={(lead) => (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(lead); }}
          className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
        >
          <Edit2 size={16} />
        </button>
      )}
      emptyMessage="Lidlar topilmadi"
    />
  );
};

export default LeadListView;
