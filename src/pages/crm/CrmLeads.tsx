/**
 * CrmLeads.tsx (Faza 0.3 — refactored)
 * Orchestrator: state, handlers, data fetching only.
 * Rendering delegated to src/components/leads/.
 */
import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { motion } from 'framer-motion';
import { Search, Filter, Plus, Download, X, GraduationCap } from 'lucide-react';

import { exportToExcel, exportToPDF } from '../../utils/export';
import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

import LeadStatsBar from '../../components/leads/LeadStatsBar';
import KanbanBoard from '../../components/leads/KanbanBoard';
import LeadListView from '../../components/leads/LeadListView';
import LeadDetailPanel from '../../components/leads/LeadDetailPanel';
import LeadFormModal from '../../components/leads/LeadFormModal';

import type { Lead, LeadActivity } from '../../components/leads/types';

const EXCEL_COLS = [
  { header: 'Ism', key: 'name', width: 25 },
  { header: 'Telefon', key: 'phone', width: 15 },
  { header: 'Email', key: 'email', width: 25 },
  { header: 'Bosqich', key: 'stage', width: 15 },
  { header: 'Manba', key: 'source', width: 15 },
  { header: 'Ball', key: 'score', width: 10 },
  { header: 'Holat', key: 'status', width: 12 },
  { header: 'Kurs', key: 'course', width: 20 },
  { header: 'Sana', key: 'createdAt', width: 15 },
];

export default function CrmLeads() {
  // ─── Data ────────────────────────────────────────────────────────────────────
  const { data: leads = [], addDocument, updateDocument, deleteDocument } = useFirestore<Lead>('leads');
  const { addDocument: addStudent } = useFirestore<any>('students');
  const { data: groups = [], updateDocument: updateGroup } = useFirestore<any>('groups');
  const { courses } = useCrmData();
  const { showToast } = useToast();

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '', phone: '', email: '', stage: 'new',
    source: 'Instagram', course: '', notes: '', score: 50, status: 'warm',
  });

  // ─── Filtered data ────────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() =>
    (leads || []).filter(l =>
      (l.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.phone || '').includes(searchQuery) ||
      (l.course || '').toLowerCase().includes(searchQuery.toLowerCase())
    ), [leads, searchQuery]);

  // ─── Modal helpers ────────────────────────────────────────────────────────────
  const openModal = (lead: Lead | null = null) => {
    setEditingLead(lead);
    setFormData(lead ?? {
      name: '', phone: '', email: '', stage: 'new',
      source: 'Instagram', course: '', notes: '', score: 50, status: 'warm',
    });
    setIsModalOpen(true);
  };
  const closeModal = () => { setIsModalOpen(false); setEditingLead(null); };

  // ─── CRUD ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.name || !formData.phone) {
      showToast('Ism va telefon raqami majburiy!', 'error'); return;
    }
    if (editingLead) {
      const data = { ...formData, date: formData.date || editingLead.date, activities: editingLead.activities || [] };
      await updateDocument(editingLead.id, data);
      if (selectedLead?.id === editingLead.id) setSelectedLead({ ...selectedLead, ...data } as Lead);
    } else {
      await addDocument({ date: new Date().toISOString(), ...formData as any });
    }
    closeModal();
  };

  const confirmDelete = async () => {
    await deleteDocument(deleteConfirm.id);
    setDeleteConfirm({ open: false, id: '' });
    setIsDetailOpen(false);
    showToast("Lid o'chirildi", 'success');
  };

  // ─── Kanban drag ─────────────────────────────────────────────────────────────
  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    await updateDocument(e.dataTransfer.getData('leadId'), { stage: stageId as any });
  };
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('leadId', id);
  };

  // ─── Activities ───────────────────────────────────────────────────────────────
  const addActivity = async (leadId: string, type: LeadActivity['type'], content: string) => {
    const newAct: LeadActivity = { id: Date.now().toString(), type, content, date: new Date().toISOString(), user: 'Admin' };
    const lead = (leads || []).find(l => l.id === leadId);
    if (!lead) return;
    const activities = [newAct, ...(lead.activities || [])];
    await updateDocument(leadId, { activities });
    if (selectedLead?.id === leadId) setSelectedLead({ ...selectedLead, activities });
  };

  // ─── Convert lead → student ───────────────────────────────────────────────────
  const handleConvertToStudent = async (lead: Lead) => {
    if (!selectedGroupId) { showToast('Iltimos, guruhni tanlang!', 'error'); return; }
    const grp = (groups || []).find((g: any) => g.id === selectedGroupId);
    const studentId = await addStudent({
      name: lead.name, phone: lead.phone, email: lead.email || '',
      address: '', birthDate: '', parentName: '', parentPhone: '',
      course: lead.course, group: grp?.name || '',
      paymentStatus: 'Kutilmoqda', balance: 0, status: 'Faol',
      joinedDate: new Date().toISOString().split('T')[0],
      notes: lead.notes || `Lid manbasi: ${lead.source}`,
    });
    if (grp) await updateGroup(selectedGroupId, { students: [...(grp.students || []), studentId] });
    await updateDocument(lead.id, { stage: 'won' });
    showToast(`${lead.name} o'quvchilar ro'yxatiga va guruhga qo'shildi!`, 'success');
    setIsConvertModalOpen(false);
    setIsDetailOpen(false);
    setSelectedGroupId('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 h-full flex flex-col">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Lidni o'chirish"
        message="Haqiqatan ham bu lidni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi."
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />

      {/* Page header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Lidlar Boshqaruvi</h1>
          <p className="text-zinc-500 text-sm font-medium">Sotuv voronkasi va marketing tahlili</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            {(['kanban', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${view === v ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}
              >
                {v === 'kanban' ? 'Kanban' : "Ro'yxat"}
              </button>
            ))}
          </div>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} /> Yangi Lid
          </button>
        </div>
      </div>

      {/* Stats */}
      <LeadStatsBar leads={leads || []} />

      {/* Search bar + export */}
      <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Lid ismi, raqami yoki kurs bo'yicha qidirish..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-black text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <Filter size={18} /> Filtrlar
        </button>
        <button
          onClick={() => exportToExcel(filteredLeads, EXCEL_COLS, 'Lidlar')}
          className="p-2 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all"
          title="Excel yuklab olish"
        >
          <Download size={16} />
        </button>
        <button
          onClick={async () => await exportToPDF(filteredLeads, EXCEL_COLS, "Lidlar Ro'yxati", 'Lidlar')}
          className="p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all"
          title="PDF yuklab olish"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Main content */}
      {view === 'kanban' ? (
        <KanbanBoard
          leads={filteredLeads}
          onDrop={handleDrop}
          onDragStart={handleDragStart}
          onLeadClick={lead => { setSelectedLead(lead); setIsDetailOpen(true); }}
        />
      ) : (
        <LeadListView
          leads={filteredLeads}
          onRowClick={lead => { setSelectedLead(lead); setIsDetailOpen(true); }}
          onEdit={openModal}
        />
      )}

      {/* Detail panel */}
      <AnimatePresence>
        {isDetailOpen && selectedLead && (
          <LeadDetailPanel
            lead={selectedLead}
            onClose={() => setIsDetailOpen(false)}
            onEdit={lead => { openModal(lead); }}
            onDelete={id => setDeleteConfirm({ open: true, id })}
            onConvert={() => setIsConvertModalOpen(true)}
            onAddActivity={addActivity}
          />
        )}
      </AnimatePresence>

      {/* Convert to student modal */}
      <AnimatePresence>
        {isConvertModalOpen && selectedLead && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-900 dark:text-white">O'quvchiga aylantirish</h3>
                <button onClick={() => setIsConvertModalOpen(false)}><X size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm font-bold text-zinc-500">
                  {selectedLead.name}ni o'quvchilar bazasiga qo'shish uchun guruhni tanlang:
                </p>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Guruhni tanlang</label>
                  <select
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                  >
                    <option value="">Tanlang...</option>
                    {(groups || []).filter((g: any) => g.status === 'Faol' || g.status === 'Yangi').map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name} ({g.subject})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                <button onClick={() => setIsConvertModalOpen(false)} className="px-4 py-2 text-sm font-bold text-zinc-500">Bekor qilish</button>
                <button
                  onClick={() => handleConvertToStudent(selectedLead)}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  <GraduationCap size={16} /> Aylantirish
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form modal */}
      <LeadFormModal
        isOpen={isModalOpen}
        editingLead={editingLead}
        formData={formData}
        courses={courses}
        onClose={closeModal}
        onSave={handleSave}
        onChange={patch => setFormData(prev => ({ ...prev, ...patch }))}
      />
    </div>
  );
}
