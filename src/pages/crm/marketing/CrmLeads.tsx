/**
 * CrmLeads.tsx (Faza 4 — server-side filtr/sahifalash, real vaqtli yangilanish)
 * Orchestrator: state, handlers, data fetching only.
 * Rendering delegated to src/components/leads/.
 */
import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Search, Plus, Download, GraduationCap, Upload } from 'lucide-react';

import { exportToExcel, exportToPDF } from '../../../utils/export';
import { useCrmData } from '../../../hooks/useCrmData';
import { useLeads } from '../../../hooks/useLeads';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ImportWizard from '../../../components/ImportWizard';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import api from '../../../api/client';

import LeadStatsBar from '../../../components/leads/LeadStatsBar';
import LeadFilters from '../../../components/leads/LeadFilters';
import LeadBulkBar from '../../../components/leads/LeadBulkBar';
import KanbanBoard from '../../../components/leads/KanbanBoard';
import LeadListView from '../../../components/leads/LeadListView';
import LeadDetailPanel from '../../../components/leads/LeadDetailPanel';
import LeadFormModal from '../../../components/leads/LeadFormModal';

import type { Lead } from '../../../components/leads/types';

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
  const {
    leads, total, stageCounts, loading, filters, updateFilters, clearFilters,
    qInput, setQInput, sort, setSort, page, setPage, limit, setLimit,
    refetch, optimisticUpdate,
  } = useLeads();
  const { courses } = useCrmData();
  const { showToast } = useToast();

  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get('/leads/assignable-users').then(res => setManagers(res.data || [])).catch(() => {});
  }, []);

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  useEffect(() => { setLimit(view === 'kanban' ? 0 : 25); }, [view, setLimit]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groups, setGroups] = useState<any[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  useEffect(() => { api.get('/groups').then(res => setGroups(res.data?.data || res.data || [])).catch(() => {}); }, []);

  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '', phone: '', stage: 'new',
    source: 'Instagram', course: '', notes: '', score: 50, status: 'warm',
  });

  const emptyForm = (): Partial<Lead> => ({
    name: '', phone: '', stage: 'new',
    source: 'Instagram', course: '', notes: '', score: 50, status: 'warm',
  });

  // ─── Modal helpers ────────────────────────────────────────────────────────────
  const openModal = (lead: Lead | null = null) => {
    setEditingLead(lead);
    setFormData(lead ?? emptyForm());
    setIsModalOpen(true);
  };
  const closeModal = () => { setIsModalOpen(false); setEditingLead(null); };

  // ─── CRUD ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.name || !formData.phone) {
      showToast('Ism va telefon raqami majburiy!', 'error'); return;
    }
    setIsSaving(true);
    try {
      if (editingLead) {
        const res = await api.put(`/leads/${editingLead.id}`, formData);
        if (selectedLead?.id === editingLead.id) setSelectedLead({ ...selectedLead, ...res.data });
        showToast('Lid yangilandi', 'success');
      } else {
        await api.post('/leads', formData);
        showToast('Yangi lid qo\'shildi', 'success');
      }
      closeModal();
      refetch();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Lidni saqlashda xatolik yuz berdi', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/leads/${deleteConfirm.id}`);
      showToast("Lid o'chirildi", 'success');
      refetch();
    } catch {
      showToast("O'chirishda xatolik yuz berdi", 'error');
    }
    setDeleteConfirm({ open: false, id: '' });
    setIsDetailOpen(false);
  };

  // ─── Kanban drag / bosqich o'zgartirish (optimistik) ──────────────────────────
  const changeStage = async (id: string, stage: string, lostReason?: string) => {
    const current = leads.find(l => l.id === id) || (selectedLead?.id === id ? selectedLead : null);
    if (current && current.stage === stage) return;

    // "O'qishni boshladi" (won) — to'g'ridan-to'g'ri PUT emas, balki haqiqiy
    // konversiya (talaba yaratish + guruhga yozish, POST /leads/:id/convert)
    // orqali o'tishi SHART. Aks holda lid Kanban'da shu ustunga sudralib
    // qo'yilardi-yu, hech qanday Student yozuvi yaratilmasdi — Marketing >
    // ROI'dagi barcha hisob-kitoblar (studentId'ga tayanadi, server/routes/
    // marketing.ts) bunday lidni umuman "g'olib" deb hisobga olmay qolardi.
    if (stage === 'won') {
      if (current) setSelectedLead(current);
      setSelectedGroupId('');
      setIsConvertModalOpen(true);
      return;
    }

    optimisticUpdate(id, { stage: stage as Lead['stage'], lostReason });
    if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, stage: stage as Lead['stage'], lostReason });
    try {
      await api.put(`/leads/${id}`, { stage, ...(lostReason ? { lostReason } : {}) });
    } catch {
      showToast("Bosqichni o'zgartirishda xatolik — qayta yuklanmoqda", 'error');
      refetch();
    }
  };

  // ─── Menejerga biriktirish ────────────────────────────────────────────────────
  const handleAssign = async (id: string, userId: string | null) => {
    const manager = managers.find(m => m.id === userId) || null;
    optimisticUpdate(id, { assignedToId: userId, assignedTo: manager });
    if (selectedLead?.id === id) setSelectedLead({ ...selectedLead, assignedToId: userId, assignedTo: manager });
    try {
      await api.post(`/leads/${id}/assign`, { userId });
    } catch {
      showToast('Biriktirishda xatolik', 'error');
      refetch();
    }
  };

  // ─── Faoliyat qo'shish ────────────────────────────────────────────────────────
  const handleLogActivity = async (leadId: string, data: any) => {
    try {
      const res = await api.post(`/leads/${leadId}/activities`, data);
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, ...res.data.lead, activities: [res.data.activity, ...(selectedLead.activities || [])] });
      }
      showToast('Faoliyat qo\'shildi', 'success');
      refetch();
    } catch {
      showToast('Faollikni saqlashda xatolik yuz berdi', 'error');
    }
  };

  // ─── Lid tafsilotini ochish (to'liq — faoliyatlar bilan) ──────────────────────
  const openDetail = async (lead: Lead) => {
    setIsDetailOpen(true);
    setSelectedLead(lead); // darhol ko'rsatish (qisman ma'lumot), keyin to'liq yuklanadi
    try {
      const res = await api.get(`/leads/${lead.id}`);
      setSelectedLead(res.data);
    } catch {
      showToast('Lid tafsilotini yuklashda xatolik', 'error');
    }
  };

  // ─── Convert lead → student (bitta tranzaksiya, backend) ──────────────────────
  const handleConvertToStudent = async (lead: Lead) => {
    if (!selectedGroupId) { showToast('Iltimos, guruhni tanlang!', 'error'); return; }
    try {
      await api.post(`/leads/${lead.id}/convert`, { groupId: selectedGroupId });
      showToast(`${lead.name} o'quvchilar ro'yxatiga va guruhga qo'shildi!`, 'success');
      setIsConvertModalOpen(false);
      setIsDetailOpen(false);
      setSelectedGroupId('');
      refetch();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "O'quvchiga aylantirishda xatolik yuz berdi", 'error');
    }
  };

  const activeFilterCount = useMemo(() => Object.values(filters).filter(v => v !== undefined && (!Array.isArray(v) || v.length > 0)).length, [filters]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 h-full flex flex-col">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="Lidni o'chirish"
        message="Haqiqatan ham bu lidni o'chirmoqchimisiz?"
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
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold transition-all text-sm"
          >
            <Upload size={16} /> Import
          </button>
          <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} /> Yangi Lid
          </button>
        </div>
      </div>

      {/* Stats */}
      <LeadStatsBar leads={leads} total={total} stageCounts={stageCounts} />

      {/* Search + filters + export */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="text"
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              placeholder="Lid ismi, raqami yoki kurs bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
          <button
            onClick={() => exportToExcel(leads, EXCEL_COLS, 'Lidlar')}
            className="p-2 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20 transition-all"
            title="Excel yuklab olish"
          >
            <Download size={16} />
          </button>
          <button
            onClick={async () => await exportToPDF(leads, EXCEL_COLS, "Lidlar Ro'yxati", 'Lidlar')}
            className="p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all"
            title="PDF yuklab olish"
          >
            <Download size={16} />
          </button>
        </div>
        <LeadFilters filters={filters} onChange={updateFilters} onClear={clearFilters} stageCounts={stageCounts} courses={courses} />
      </div>

      {/* Main content */}
      {view === 'kanban' ? (
        <KanbanBoard
          leads={leads}
          stageCounts={stageCounts}
          onDrop={(id, stage) => changeStage(id, stage)}
          onStageChange={changeStage}
          onLeadClick={openDetail}
        />
      ) : (
        <LeadListView
          leads={leads}
          total={total}
          page={page}
          limit={limit}
          loading={loading}
          sort={sort}
          onSortChange={setSort}
          onPageChange={setPage}
          onRowClick={openDetail}
          onEdit={openModal}
          selection={{ value: selectedIds, onChange: setSelectedIds }}
        />
      )}

      <LeadBulkBar
        selectedIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
        onDone={() => { setSelectedIds(new Set()); refetch(); }}
        showToast={showToast}
      />

      {/* Detail panel */}
      <AnimatePresence>
        {isDetailOpen && selectedLead && (
          <LeadDetailPanel
            lead={selectedLead}
            managers={managers}
            onClose={() => setIsDetailOpen(false)}
            onEdit={lead => { openModal(lead); }}
            onDelete={id => setDeleteConfirm({ open: true, id })}
            onConvert={() => setIsConvertModalOpen(true)}
            onStageChange={changeStage}
            onAssign={handleAssign}
            onLogActivity={handleLogActivity}
          />
        )}
      </AnimatePresence>

      {/* Convert to student modal */}
      {selectedLead && (
        <Modal
          isOpen={isConvertModalOpen}
          onClose={() => setIsConvertModalOpen(false)}
          title="O'quvchiga aylantirish"
          width="sm"
        >
          <div className="space-y-4">
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
                {(groups || []).filter((g: any) => g.status === 'active').map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.course?.name || 'Kurssiz'})</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
              <Button variant="secondary" onClick={() => setIsConvertModalOpen(false)}>Bekor qilish</Button>
              <Button variant="primary" className="!bg-emerald-600 hover:!bg-emerald-700 !shadow-emerald-600/20" onClick={() => handleConvertToStudent(selectedLead)} leftIcon={<GraduationCap size={16} />}>
                Aylantirish
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Form modal */}
      <LeadFormModal
        isOpen={isModalOpen}
        editingLead={editingLead}
        formData={formData}
        courses={courses}
        managers={managers}
        saving={isSaving}
        onClose={closeModal}
        onSave={handleSave}
        onChange={patch => setFormData(prev => ({ ...prev, ...patch }))}
      />

      {isImportOpen && (
        <ImportWizard
          collection="leads"
          onClose={() => setIsImportOpen(false)}
          onSuccess={() => { setIsImportOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
