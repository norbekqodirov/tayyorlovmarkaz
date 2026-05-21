import { useState, useEffect } from 'react';
import { Award, Plus, Download, Trash2, Edit3, QrCode, FileText, X, Send, Search } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/ui/PageHeader';
import StatCard from '../../components/ui/StatCard';
import DataTable, { DataTableColumn } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Tabs, TabsList, Tab, TabPanel } from '../../components/ui/Tabs';
import { useFirestore } from '../../hooks/useFirestore';
import { useSocket } from '../../hooks/useSocket';

interface CertTemplate {
  id: string;
  name: string;
  type: string;
  background: string | null;
  config: { elements: any[] };
  width: number;
  height: number;
  isActive: boolean;
  createdAt: string;
}

interface Certificate {
  id: string;
  serialNumber: string;
  studentId: string;
  courseId: string | null;
  templateId: string;
  pdfUrl: string | null;
  grade: string | null;
  issuedAt: string;
  revokedAt: string | null;
  student: { id: string; name: string; phone: string | null };
  course?: { id: string; name: string } | null;
  template: { id: string; name: string };
}

export default function CrmCertificates() {
  const [activeTab, setActiveTab] = useState('issued');
  const [templates, setTemplates] = useState<CertTemplate[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CertTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; type: 'cert' | 'template' }>({ open: false, id: '', type: 'cert' });
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const { data: students = [] } = useFirestore<any>('students');
  const { data: courses = [] } = useFirestore<any>('courses');

  const [issueForm, setIssueForm] = useState({
    templateId: '',
    studentIds: [] as string[],
    courseId: '',
    grade: '',
  });

  const [templateForm, setTemplateForm] = useState<Partial<CertTemplate>>({
    name: '',
    type: 'certificate',
    width: 842,
    height: 595,
    isActive: true,
    config: { elements: [] },
  });

  // Load templates + certs
  const load = async () => {
    setLoading(true);
    try {
      const [tplRes, certRes] = await Promise.all([
        api.get('/certificates/templates'),
        api.get('/certificates'),
      ]);
      setTemplates(tplRes.data || []);
      setCertificates(certRes.data?.data || []);
    } catch (err) {
      console.warn('Sertifikatlarni yuklab bo\'lmadi', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useSocket<{ current: number; total: number }>('certificate:progress', (data) => {
    setProgress(data);
    if (data.current >= data.total) {
      setTimeout(() => { setProgress(null); load(); }, 800);
    }
  });

  const stats = {
    total: certificates.length,
    thisMonth: certificates.filter(c => {
      const d = new Date(c.issuedAt);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length,
    templates: templates.length,
    revoked: certificates.filter(c => c.revokedAt).length,
  };

  const filteredCerts = certificates.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.serialNumber.toLowerCase().includes(q) ||
      c.student?.name?.toLowerCase().includes(q) ||
      c.course?.name?.toLowerCase().includes(q)
    );
  });

  const certColumns: DataTableColumn<Certificate>[] = [
    {
      id: 'serial',
      header: 'Seriya raqami',
      accessor: (c) => c.serialNumber,
      cell: (c) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/15 text-amber-600 flex items-center justify-center">
            <Award size={14} />
          </div>
          <span className="font-black text-slate-900 dark:text-white">{c.serialNumber}</span>
        </div>
      ),
      sortable: true,
    },
    {
      id: 'student',
      header: 'O\'quvchi',
      accessor: (c) => c.student?.name || '',
      sortable: true,
    },
    {
      id: 'course',
      header: 'Kurs',
      cell: (c) => c.course?.name || '—',
    },
    {
      id: 'grade',
      header: 'Baho',
      cell: (c) => c.grade ? (
        <span className="px-2 py-1 rounded-md text-xs font-black bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
          {c.grade}
        </span>
      ) : '—',
    },
    {
      id: 'issued',
      header: 'Berilgan',
      accessor: (c) => c.issuedAt,
      cell: (c) => new Date(c.issuedAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }),
      sortable: true,
    },
    {
      id: 'status',
      header: 'Holat',
      cell: (c) => c.revokedAt ? (
        <span className="px-2 py-1 rounded-md text-[10px] font-black bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 uppercase">
          Bekor qilingan
        </span>
      ) : (
        <span className="px-2 py-1 rounded-md text-[10px] font-black bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 uppercase">
          Faol
        </span>
      ),
    },
  ];

  const handleIssue = async () => {
    if (!issueForm.templateId) { showToast('Shablon tanlanmagan', 'error'); return; }
    if (issueForm.studentIds.length === 0) { showToast('Kamida bitta o\'quvchi tanlang', 'error'); return; }

    try {
      setProgress({ current: 0, total: issueForm.studentIds.length });
      const res = await api.post('/certificates/generate', {
        templateId: issueForm.templateId,
        studentIds: issueForm.studentIds,
        courseId: issueForm.courseId || null,
        grade: issueForm.grade || null,
      });
      showToast(`${res.data.generated} ta sertifikat yaratildi`, 'success');
      setIssueModalOpen(false);
      setIssueForm({ templateId: '', studentIds: [], courseId: '', grade: '' });
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Xatolik yuz berdi', 'error');
      setProgress(null);
    }
  };

  const handleDelete = async () => {
    try {
      if (deleteConfirm.type === 'cert') {
        await api.delete(`/certificates/${deleteConfirm.id}`);
        showToast('Sertifikat o\'chirildi', 'success');
      } else {
        await api.delete(`/certificates/templates/${deleteConfirm.id}`);
        showToast('Shablon o\'chirildi', 'success');
      }
      load();
    } catch {
      showToast('Xatolik', 'error');
    }
    setDeleteConfirm({ open: false, id: '', type: 'cert' });
  };

  const handleZipDownload = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { showToast('Sertifikat tanlang', 'error'); return; }
    try {
      const res = await api.post('/certificates/zip', { ids }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificates-${Date.now()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`${ids.length} ta sertifikat ZIP'da yuklab olindi`, 'success');
    } catch {
      showToast('Yuklab olishda xatolik', 'error');
    }
  };

  const saveTemplate = async () => {
    if (!templateForm.name?.trim()) { showToast('Shablon nomi kerak', 'error'); return; }
    try {
      if (editingTemplate) {
        await api.put(`/certificates/templates/${editingTemplate.id}`, templateForm);
        showToast('Shablon yangilandi');
      } else {
        await api.post('/certificates/templates', templateForm);
        showToast('Shablon yaratildi');
      }
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      setTemplateForm({ name: '', type: 'certificate', width: 842, height: 595, isActive: true, config: { elements: [] } });
      load();
    } catch {
      showToast('Xatolik', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title={deleteConfirm.type === 'cert' ? 'Sertifikatni o\'chirish' : 'Shablonni o\'chirish'}
        message="Bu amalni qaytarib bo'lmaydi. Davom etasizmi?"
        confirmText="O'chirish"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '', type: 'cert' })}
      />

      <PageHeader
        title="Sertifikatlar"
        subtitle="O'quvchilarga sertifikat va diplom berish"
        badge={{ label: 'Yangi', color: 'amber' }}
        actions={
          <Button leftIcon={<Plus size={16} />} onClick={() => setIssueModalOpen(true)}>
            Sertifikat berish
          </Button>
        }
        tabs={[
          { id: 'issued', label: 'Berilgan', count: certificates.length },
          { id: 'templates', label: 'Shablonlar', count: templates.length },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Jami" value={stats.total} icon={<Award size={20} />} color="amber" variant="minimal" />
        <StatCard label="Bu oy" value={stats.thisMonth} icon={<FileText size={20} />} color="emerald" variant="minimal" />
        <StatCard label="Shablonlar" value={stats.templates} icon={<Edit3 size={20} />} color="violet" variant="minimal" />
        <StatCard label="Bekor qilingan" value={stats.revoked} icon={<X size={20} />} color="rose" variant="minimal" />
      </div>

      {progress && (
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-blue-200 dark:border-blue-500/30">
          <div className="flex items-center justify-between text-sm font-bold mb-2">
            <span>Sertifikatlar yaratilmoqda...</span>
            <span className="text-blue-600">{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {activeTab === 'issued' && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Seriya, ism, kurs bo'yicha qidirish..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            {selectedIds.size > 0 && (
              <Button variant="secondary" leftIcon={<Download size={16} />} onClick={handleZipDownload}>
                ZIP ({selectedIds.size})
              </Button>
            )}
          </div>

          <DataTable
            data={filteredCerts}
            columns={certColumns}
            loading={loading}
            selection={{ value: selectedIds, onChange: setSelectedIds }}
            emptyMessage="Hali sertifikat berilmagan"
            rowActions={(c) => (
              <div className="flex items-center gap-1 justify-end">
                <a
                  href={c.pdfUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-md text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/15"
                  title="PDF"
                >
                  <FileText size={14} />
                </a>
                <a
                  href={`/verify/${c.serialNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-md text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/15"
                  title="Tekshirish"
                >
                  <QrCode size={14} />
                </a>
                <button
                  onClick={() => setDeleteConfirm({ open: true, id: c.id, type: 'cert' })}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          />
        </div>
      )}

      {activeTab === 'templates' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button leftIcon={<Plus size={16} />} onClick={() => {
              setEditingTemplate(null);
              setTemplateForm({ name: '', type: 'certificate', width: 842, height: 595, isActive: true, config: { elements: [] } });
              setTemplateModalOpen(true);
            }}>
              Yangi shablon
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:shadow-md transition-shadow">
                <div className="aspect-[1.4/1] bg-zinc-50 dark:bg-zinc-800/50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                  {t.background ? (
                    <img src={t.background} alt={t.name} className="w-full h-full object-cover" />
                  ) : (
                    <Award size={40} className="text-zinc-300 dark:text-zinc-700" />
                  )}
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">{t.name}</h3>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                  {t.type} · {t.width}×{t.height}px
                </p>
                <div className="flex gap-2 mt-3">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => {
                    setEditingTemplate(t);
                    setTemplateForm({ ...t });
                    setTemplateModalOpen(true);
                  }}>
                    Tahrirlash
                  </Button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, id: t.id, type: 'template' })}
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="col-span-full py-12 text-center text-zinc-400">
                <Award size={40} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                <p className="text-sm font-bold">Hali shablon yo'q</p>
                <p className="text-xs mt-1">Yangi shablon qo'shing va sertifikat bera boshlang</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Issue Modal */}
      <Modal isOpen={issueModalOpen} onClose={() => setIssueModalOpen(false)} title="Sertifikat berish">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Shablon</label>
            <select
              value={issueForm.templateId}
              onChange={(e) => setIssueForm({ ...issueForm, templateId: e.target.value })}
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Shablon tanlang</option>
              {templates.filter(t => t.isActive).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Kurs (ixtiyoriy)</label>
            <select
              value={issueForm.courseId}
              onChange={(e) => setIssueForm({ ...issueForm, courseId: e.target.value })}
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Kurs tanlang</option>
              {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Input
            label="Baho (ixtiyoriy)"
            placeholder="A+, 95%, Excellent..."
            value={issueForm.grade}
            onChange={(e) => setIssueForm({ ...issueForm, grade: e.target.value })}
          />
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">
              O'quvchilar ({issueForm.studentIds.length} ta tanlangan)
            </label>
            <div className="max-h-60 overflow-y-auto bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl divide-y divide-zinc-200 dark:divide-zinc-700">
              {students.map((s: any) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={issueForm.studentIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setIssueForm({ ...issueForm, studentIds: [...issueForm.studentIds, s.id] });
                      } else {
                        setIssueForm({ ...issueForm, studentIds: issueForm.studentIds.filter(id => id !== s.id) });
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-sm font-bold text-slate-700 dark:text-zinc-300">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIssueModalOpen(false)} className="flex-1">Bekor qilish</Button>
            <Button onClick={handleIssue} leftIcon={<Send size={16} />} className="flex-1">Berish</Button>
          </div>
        </div>
      </Modal>

      {/* Template Modal — simplified for now */}
      <Modal isOpen={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={editingTemplate ? 'Shablonni tahrirlash' : 'Yangi shablon'}>
        <div className="space-y-4">
          <Input label="Nomi" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-1.5 block">Turi</label>
            <select
              value={templateForm.type}
              onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value })}
              className="w-full px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold"
            >
              <option value="certificate">Sertifikat</option>
              <option value="diploma">Diplom</option>
              <option value="recognition">Tan olish</option>
            </select>
          </div>
          <Input label="Fon rasmi URL" value={templateForm.background || ''} onChange={(e) => setTemplateForm({ ...templateForm, background: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" label="Eni (px)" value={templateForm.width} onChange={(e) => setTemplateForm({ ...templateForm, width: Number(e.target.value) })} />
            <Input type="number" label="Bo'yi (px)" value={templateForm.height} onChange={(e) => setTemplateForm({ ...templateForm, height: Number(e.target.value) })} />
          </div>
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
            <p className="font-bold mb-1">💡 Element joylashtirish:</p>
            <p>Visual editor kelajakda. Hozircha JSON config ishlatish mumkin.</p>
            <p className="font-mono text-[10px] mt-1">{`{ "elements": [{ "type": "text", "x": 100, "y": 200, "text": "{{name}}", "fontSize": 32 }] }`}</p>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setTemplateModalOpen(false)} className="flex-1">Bekor qilish</Button>
            <Button onClick={saveTemplate} className="flex-1">Saqlash</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
