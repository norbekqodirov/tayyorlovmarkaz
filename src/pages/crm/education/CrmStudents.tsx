import { getCurrentRoleLevel, ROLE_LEVEL, hasAnyPermission } from '../../../utils/roles';
import { toTashkentDate } from '../../../utils/tashkentDate';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Edit2, Trash2, X, Check, Users, DollarSign,
  BookOpen, Phone, Mail, MapPin, Calendar,
  User, GraduationCap,
  AlertCircle, Download, Send, ExternalLink, Copy, Upload, Archive
} from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import ArchivedRecordsModal from '../../../components/ArchivedRecordsModal';
import BalanceAdjustModal from '../../../components/BalanceAdjustModal';
import ImportWizard from '../../../components/ImportWizard';
import Pagination from '../../../components/Pagination';
import { SkeletonTable } from '../../../components/Skeleton';
import { EmptyState, ErrorState } from '../../../components/States';
import { Input } from '../../../components/ui/Input';
import { PhoneInput } from '../../../components/ui/PhoneInput';
import { Badge } from '../../../components/ui/Badge';
import { studentStatusBadge, paymentStatusBadge, studentStatusToUi } from '../../../utils/statusBadge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { exportToExcel, exportToPDF, exportCertificateToPDF } from '../../../utils/export';
import { useCrmData } from '../../../hooks/useCrmData';
import { formatNumber } from '../../../utils/formatters';

interface Student {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  birthDate: string;
  parentName: string;
  parentPhone: string;
  course: string;
  group: string;
  paymentStatus: 'Tolov qilingan' | 'Qarzdorlik' | 'Kutilmoqda' | 'Hisobsiz';
  balance: number;
  status: 'Faol' | 'Muzlatilgan' | 'Tark etgan' | 'Bitiruvchi';
  joinedDate: string;
  notes: string;
}

export default function CrmStudents() {
  const canManage = getCurrentRoleLevel() >= ROLE_LEVEL.MANAGER;
  const navigate = useNavigate();
  const { data: rawStudents = [], loading, error, addDocument, updateDocument, deleteDocument, refetch } = useFirestore<Omit<Student, 'id'>>('students');
  // IP-04 (TL-13): bazada holat kanonik (active/frozen/left/graduated) — sahifa
  // o'zbekcha nomlar bilan ishlaydi. Ilgari "Faol" filtri/statistikasi bazadagi
  // 'active' bilan mos kelmasdi va tahrir formasi holatni noto'g'ri ko'rsatardi.
  // HB-01: qarzdorlik manbai — balans (< 0). Saqlangan paymentStatus ba'zi
  // oqimlarda (to'g'ridan-to'g'ri balans o'zgarishi) eskirib qolishi mumkin.
  const students = useMemo(() => (rawStudents || []).map((s: any) => ({
    ...s,
    status: studentStatusToUi(s.status),
    paymentStatus: (s.balance ?? 0) < 0 ? 'Qarzdorlik' : s.paymentStatus === 'Qarzdorlik' ? 'Tolov qilingan' : s.paymentStatus,
  })), [rawStudents]) as typeof rawStudents;
  const { data: groups = [], loading: groupsLoading, error: groupsError, refetch: refetchGroups } = useFirestore<any>('groups');
  const { courses: liveCourses, groups: liveGroups } = useCrmData();
  const courseOptions = liveCourses.length > 0 ? liveCourses : [];
  const groupOptions = liveGroups.length > 0 ? liveGroups : (groups || []);
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('Barchasi');
  const [filterCourse, setFilterCourse] = useState<string>('Barchasi');
  const [filterPayment, setFilterPayment] = useState<string>('Barchasi');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // IP-02: balans faqat sababli tuzatish orqali (Moliya ruxsati bilan)
  const canAdjustBalance = hasAnyPermission('finance');
  // RX-04: ustoz (TEACHER) o'quvchi moliyasini ko'rmaydi — server ham balans/to'lov
  // holatini unga qaytarmaydi; ustunlar va kartochkalar shunga mos yashiriladi.
  const showFinance = canManage;
  const [balanceTarget, setBalanceTarget] = useState<{ id: string; name: string; balance?: number | null } | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  // O'quvchi guruhda qachondan o'qiyotgani (tizimga kiritilgan kun emas) — admin belgilaydi
  const [groupStartDate, setGroupStartDate] = useState(() => toTashkentDate());
  const [currentPeriod, setCurrentPeriod] = useState<{ id: string; groupId: string; startDate: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const itemsPerPage = 20;

  const [formData, setFormData] = useState<Partial<Student>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    birthDate: '',
    parentName: '',
    parentPhone: '',
    course: '',
    group: '',
    paymentStatus: 'Kutilmoqda',
    balance: 0,
    status: 'Faol',
    joinedDate: toTashkentDate(),
    notes: ''
  });

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name?.trim()) {
      errs.name = "O'quvchi F.I.O kiritilishi shart!";
    }

    const cleanPhone = (formData.phone || '').replace(/\D/g, '');
    if (!formData.phone?.trim()) {
      errs.phone = "Telefon raqam kiritilishi shart!";
    } else if (cleanPhone.length < 9) {
      errs.phone = "Telefon raqam to'liq emas (+998 90 123 45 67)";
    }

    if (formData.email && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        errs.email = "Email formati noto'g'ri!";
      }
    }

    if (formData.parentPhone && formData.parentPhone.trim()) {
      const cleanParentPhone = formData.parentPhone.replace(/\D/g, '');
      if (cleanParentPhone.length < 9) {
        errs.parentPhone = "Ota-ona telefoni to'liq emas";
      }
    }

    const selGroup = groupOptions.find((g: any) => g.id === selectedGroupId) as any;
    if (selectedGroupId) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(groupStartDate)) errs.groupStartDate = "Guruhda o'qishni boshlagan sanani kiriting";
      else if (selGroup?.startDate && groupStartDate < selGroup.startDate) errs.groupStartDate = `Guruh ${selGroup.startDate} dan boshlangan — undan oldingi sana bo'lmaydi`;
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!canManage) return;
    if (!validateForm()) {
      showToast("Formadagi xatolarni tuzating!", 'error');
      return;
    }

    try {
      // IP-02 (ML-03): balans va to'lov holati profil formasi orqali YUBORILMAYDI —
      // ilgari oynani ochgan paytdagi eski balans qayta yozilib, shu orada
      // kiritilgan to'lov "yo'qolardi". Balans — faqat to'lov oqimlari va
      // "Balansni tuzatish" (sababli, audit qilinadigan) orqali.
      const { balance: _balance, paymentStatus: _paymentStatus, ...profileFields } = formData as any;
      const studentData = {
        ...profileFields,
        name: formData.name!.trim(),
        phone: formData.phone!.trim(),
        email: formData.email ? formData.email.trim() : '',
      } as Omit<Student, 'id'>;
      if (formData.id) {
        // Guruh o'zgargan bo'lsa — haqiqiy Enrollment yozuvini yangilaymiz
        // (Group.students maydoni sxemada yo'q, shuning uchun bevosita
        // /api/enrollments orqali ishlaymiz — billing, davomat va bot shu
        // jadvalga qaraydi, faqat Student.group matn maydoniga emas).
        const oldStudent = (students || []).find((s: any) => s.id === formData.id) as any;
        const oldGroupId: string | undefined = currentPeriod?.groupId ?? groupOptions.find((g: any) => g.name === oldStudent?.group)?.id;
        if (oldGroupId !== selectedGroupId) {
          if (oldGroupId) {
            await api.delete('/enrollments/remove', { data: { studentId: formData.id, groupId: oldGroupId } });
          }
          if (selectedGroupId) {
            await api.post('/enrollments', { studentId: formData.id, groupId: selectedGroupId, startDate: groupStartDate });
          }
        } else if (currentPeriod && currentPeriod.groupId === selectedGroupId && currentPeriod.startDate !== groupStartDate) {
          // Shu guruhda — faqat boshlash sanasi tuzatildi
          await api.post('/enrollments/periods/start-dates', { groupId: selectedGroupId, items: [{ periodId: currentPeriod.id, startDate: groupStartDate }] });
        }
        await updateDocument(formData.id, studentData);
        showToast("O'quvchi ma'lumotlari yangilandi", 'success');
      } else {
        const newId = await addDocument(studentData);
        if (selectedGroupId && newId) {
          await api.post('/enrollments', { studentId: newId, groupId: selectedGroupId, startDate: groupStartDate });
        }
        showToast("Yangi o'quvchi qo'shildi", 'success');
      }
      closeModal();
    } catch (error: any) {
      console.error("Error saving student:", error);
      showToast(error?.response?.data?.message || "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.", 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManage) return;
    setDeleteConfirm({ open: true, id });
  };

  const confirmDelete = async () => {
    if (!canManage) return;
    const id = deleteConfirm.id;
    setDeleteConfirm({ open: false, id: '' });
    try {
      // IP-01: server tarixi bor o'quvchini jismonan o'chirmaydi — arxivlaydi
      // (to'lov, davomat, baholar saqlanadi, "Arxiv" oynasidan tiklanadi).
      const result = await deleteDocument(id);
      if (selectedStudent?.id === id) setIsDetailOpen(false);
      showToast(result?.archived === false
        ? "O'quvchi o'chirildi (tarixi yo'q edi)"
        : "O'quvchi arxivlandi — to'lov, davomat va baholar saqlandi", 'success');
    } catch (error) {
      console.error("Error deleting student:", error);
      showToast("Arxivlashda xatolik yuz berdi. Qayta urinib ko'ring.", 'error');
    }
  };

  const confirmBulkDelete = async () => {
    if (!canManage || selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    let successCount = 0;
    let failCount = 0;
    const remainingIds = new Set(selectedIds);
    for (const id of Array.from(selectedIds)) {
      try {
        await deleteDocument(id);
        remainingIds.delete(id);
        successCount++;
      } catch (err) {
        console.error(`Error deleting student ${id}:`, err);
        failCount++;
      }
    }
    setSelectedIds(remainingIds);
    setBulkDeleteConfirm(false);
    setIsBulkDeleting(false);
    if (failCount > 0) {
      showToast(`${successCount} ta o'quvchi arxivlandi, ${failCount} tasida xatolik yuz berdi`, 'error');
    } else {
      showToast(`${successCount} ta o'quvchi arxivlandi — tarixi saqlandi`, 'success');
    }
  };

  const openModal = (student: Student | null = null) => {
    if (!canManage) return;
    setFormErrors({});
    if (student) {
      setFormData({
        ...student,
        email: student.email || '',
      });
      const gid = groupOptions.find((g: any) => g.name === student.group)?.id || '';
      setSelectedGroupId(gid);
      setCurrentPeriod(null);
      setGroupStartDate(toTashkentDate());
      // Joriy a'zolik (guruh va boshlanish sanasi) — haqiqiy davrdan; matn maydoni (student.group)
      // bo'sh yoki eskirgan bo'lishi mumkin
      api.get('/enrollments/periods', { params: { studentId: student.id } }).then(r => {
        const active = (Array.isArray(r.data) ? r.data : []).filter((x: any) => x.status === 'active');
        const p = active.find((x: any) => x.groupId === gid) ?? active[0];
        if (p) {
          setSelectedGroupId(p.groupId);
          setCurrentPeriod({ id: p.id, groupId: p.groupId, startDate: p.startDate });
          setGroupStartDate(p.startDate);
        }
      }).catch(() => { /* guruh matn maydonidan, sana bugungi bilan qoladi */ });
    } else {
      setCurrentPeriod(null);
      setGroupStartDate(toTashkentDate());
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        birthDate: '',
        parentName: '',
        parentPhone: '',
        course: '',
        group: '',
        paymentStatus: 'Kutilmoqda',
        balance: 0,
        status: 'Faol',
        joinedDate: toTashkentDate(),
        notes: ''
      });
      setSelectedGroupId('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const filteredStudents = useMemo(() => {
    return (students || []).filter(s => {
      const matchesSearch = (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.phone || '').includes(searchTerm) ||
                          (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.group || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'Barchasi' || s.status === filterStatus;
      const matchesCourse = filterCourse === 'Barchasi' || s.course === filterCourse;
      const matchesPayment = filterPayment === 'Barchasi' || s.paymentStatus === filterPayment;
      return matchesSearch && matchesStatus && matchesCourse && matchesPayment;
    });
  }, [students, searchTerm, filterStatus, filterCourse, filterPayment]);

  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(start, start + itemsPerPage);
  }, [filteredStudents, currentPage]);

  const stats = {
    total: (students || []).length,
    active: (students || []).filter(s => s.status === 'Faol').length,
    debtors: (students || []).filter(s => s.paymentStatus === 'Qarzdorlik').length,
    totalBalance: (students || []).reduce((acc, s) => acc + (s.balance || 0), 0)
  };

  if (error) return <ErrorState message="Sinxronizatsiyada xatolik yuz berdi" onRetry={refetch} />;
  if (loading) return <SkeletonTable rows={8} cols={5} />;

  return (
    <div className="space-y-6">
      {groupsError && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p>Guruhlar ro'yxatini yuklab bo'lmadi. Qayta urinib ko'ring.</p>
          <Button variant="secondary" isLoading={groupsLoading} onClick={() => void refetchGroups()}>
            Qayta yuklash
          </Button>
        </div>
      )}
      <ConfirmDialog
        isOpen={canManage && deleteConfirm.open}
        title="O'quvchini arxivlash"
        message="O'quvchi ro'yxatlardan, guruh davomati va xabarlardan chiqariladi. To'lovlar, davomat va baholar o'chmaydi — keyin «Arxiv» oynasidan tiklash mumkin."
        confirmText="Arxivlash"
        type="warning"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      <ConfirmDialog
        isOpen={canManage && bulkDeleteConfirm}
        title="Tanlangan o'quvchilarni arxivlash"
        message={`Tanlangan ${selectedIds.size} ta o'quvchi arxivlanadi. Ularning to'lov, davomat va baholari saqlanadi va keyin tiklash mumkin.`}
        confirmText="Arxivlash"
        type="warning"
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteConfirm(false)}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">O'quvchilar Boshqaruvi</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Markaz o'quvchilari, ularning natijalari va to'lovlari</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors">
              <Download size={18} />
              Eksport
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
              <button onClick={() => {
                const cols = [
                  { header: 'Ism', key: 'name', width: 25 },
                  { header: 'Telefon', key: 'phone', width: 15 },
                  { header: 'Email', key: 'email', width: 25 },
                  { header: 'Guruh', key: 'group', width: 15 },
                  { header: 'Holat', key: 'status', width: 12 },
                  ...(showFinance ? [{ header: "To'lov", key: 'paymentStatus', width: 15 }] : []),
                ];
                exportToExcel(filteredStudents, cols, "Oqquchilar");
                showToast("Excel fayl yuklab olindi", 'success');
              }} className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-t-xl transition-colors">
                Excel (.xlsx)
              </button>
              <button onClick={() => {
                const cols = [
                  { header: 'Ism', key: 'name' },
                  { header: 'Telefon', key: 'phone' },
                  { header: 'Email', key: 'email' },
                  { header: 'Guruh', key: 'group' },
                  { header: 'Holat', key: 'status' },
                  ...(showFinance ? [{ header: "To'lov", key: 'paymentStatus' }] : []),
                ];
                exportToPDF(filteredStudents, cols, "O'quvchilar ro'yxati", "Oqquchilar");
                showToast("PDF fayl yuklab olindi", 'success');
              }} className="w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-b-xl transition-colors">
                PDF (.pdf)
              </button>
            </div>
          </div>
          {canManage && <button
            onClick={() => setArchiveOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors"
            title="Arxivlangan o'quvchilar"
          >
            <Archive size={18} />
            Arxiv
          </button>}
          {canManage && <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-colors"
            title="Excel/CSV dan import qilish"
          >
            <Upload size={18} />
            Import
          </button>}
          {canManage && <button
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={18} />
            Yangi O'quvchi
          </button>}
        </div>
      </div>

      <ArchivedRecordsModal
        isOpen={canManage && archiveOpen}
        onClose={() => setArchiveOpen(false)}
        collection="students"
        title="Arxivlangan o'quvchilar"
        describe={(s) => [s.phone, s.group].filter(Boolean).join(' · ')}
        onRestored={() => { void refetch(); }}
      />

      {/* Excel/CSV Import sehrgari */}
      <AnimatePresence>
        {canManage && importOpen && (
          <ImportWizard
            collection="students"
            onClose={() => setImportOpen(false)}
            onSuccess={() => { refetch(); showToast('Import yakunlandi', 'success'); }}
          />
        )}
      </AnimatePresence>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard variant="gradient" color="blue" label="Jami O'quvchilar" value={stats.total} sub="Ro'yxatdagi jami" icon={<Users size={17} strokeWidth={2.5} />} />
        <StatCard variant="gradient" color="emerald" label="Faol O'quvchilar" value={stats.active} sub="Hozir o'qiyotgan" icon={<GraduationCap size={17} strokeWidth={2.5} />} />
        {showFinance && <StatCard variant="gradient" color="rose" label="Qarzdorlar" value={stats.debtors} sub="To'lov qilmagan" icon={<AlertCircle size={17} strokeWidth={2.5} />} />}
        {showFinance && <StatCard variant="gradient" color="amber" label="Umumiy Balans" value={formatNumber(stats.totalBalance)} sub="so'm" icon={<DollarSign size={17} strokeWidth={2.5} />} />}
      </div>

      {/* Filters and Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
              <input
                type="text"
                placeholder="Ism, telefon yoki guruh bo'yicha qidirish..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                className="w-full sm:w-auto px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Barchasi">Barcha holatlar</option>
                <option value="Faol">Faol</option>
                <option value="Muzlatilgan">Muzlatilgan</option>
                <option value="Tark etgan">Tark etgan</option>
                <option value="Bitiruvchi">Bitiruvchi</option>
              </select>
              <select
                value={filterCourse}
                onChange={(e) => { setFilterCourse(e.target.value); setCurrentPage(1); }}
                className="w-full sm:w-auto px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Barchasi">Barcha kurslar</option>
                {courseOptions.map((c: any) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              {showFinance && <select
                value={filterPayment}
                onChange={(e) => { setFilterPayment(e.target.value); setCurrentPage(1); }}
                className="w-full sm:w-auto px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
              >
                <option value="Barchasi">Barcha to'lovlar</option>
                <option value="Tolov qilingan">To'lov qilingan</option>
                <option value="Qarzdorlik">Qarzdorlik</option>
                <option value="Kutilmoqda">Kutilmoqda</option>
                <option value="Hisobsiz">Hisob yo'q (guruhsiz)</option>
              </select>}
              {canManage && selectedIds.size > 0 && (
                <button
                  onClick={() => setBulkDeleteConfirm(true)}
                  className="px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-black hover:bg-rose-700 transition-colors"
                >
                  <Archive size={16} className="inline mr-1.5" />
                  {selectedIds.size} tasini arxivlash
                </button>
              )}
            </div>
          </div>
          {filteredStudents.length > 0 && (
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {filteredStudents.length} ta o'quvchi topildi
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedIds.has(s.id))}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      paginatedStudents.forEach(s => e.target.checked ? next.add(s.id) : next.delete(s.id));
                      setSelectedIds(next);
                    }}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">O'quvchi</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs va Guruh</th>
                {showFinance && <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">To'lov Holati</th>}
                {showFinance && <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Balans</th>}
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</th>
                <th className="px-4 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {(paginatedStudents || []).length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState 
                      title={searchTerm || filterStatus !== 'Barchasi' ? "Hech narsa topilmadi" : "O'quvchilar yo'q"} 
                      message={searchTerm || filterStatus !== 'Barchasi' ? "Qidiruv shartiga mos o'quvchi topilmadi." : "Hali ro'yxatda o'quvchi mavjud emas."} 
                      actionLabel={!searchTerm && filterStatus === 'Barchasi' ? "+ O'quvchi qo'shish" : undefined}
                      onAction={() => openModal()}
                    />
                  </td>
                </tr>
              ) : (
              (paginatedStudents || []).map((student) => (
                <tr
                  key={student.id}
                  onClick={() => { setSelectedStudent(student); setIsDetailOpen(true); }}
                  className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group ${selectedIds.has(student.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                >
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(student.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(student.id) : next.delete(student.id);
                        setSelectedIds(next);
                      }}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black">
                        {(student.name || '?').charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 dark:text-white tracking-tight">{student.name}</p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{student.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{student.course}</span>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{student.group}</span>
                    </div>
                  </td>
                  {showFinance && <td className="px-4 py-4">
                    {(() => { const b = paymentStatusBadge(student.paymentStatus); return <Badge color={b.color}>{b.label}</Badge>; })()}
                  </td>}
                  {showFinance && <td className="px-6 py-4">
                    <span className={`text-sm font-black ${student.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatNumber(student.balance)}
                    </span>
                  </td>}
                  <td className="px-4 py-4">
                    {(() => { const b = studentStatusBadge(student.status); return <Badge color={b.color}>{b.label}</Badge>; })()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {canManage && <button 
                        onClick={(e) => { e.stopPropagation(); openModal(student); }}
                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 rounded-lg transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>}
                      {canManage && <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}
                        className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 rounded-lg transition-colors"
                        title="Arxivlash"
                        aria-label="Arxivlash"
                      >
                        <Archive size={16} />
                      </button>}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredStudents.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Student Detail Sidebar */}
      <AnimatePresence>
        {isDetailOpen && selectedStudent && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-y-auto border-l border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">O'quvchi Profili</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setIsDetailOpen(false); navigate(`/crmtayyorlovmarkaz/students/${selectedStudent.id}`); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      <ExternalLink size={12} /> To'liq profil
                    </button>
                    <button onClick={() => setIsDetailOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-24 h-24 rounded-3xl bg-blue-600 text-white flex items-center justify-center text-3xl font-black shadow-xl shadow-blue-600/20">
                    {(selectedStudent.name || '?').charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">{selectedStudent.name}</h3>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">{selectedStudent.group}</p>
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <p className="text-[10px] font-black text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">ID: {selectedStudent.id}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {showFinance && <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Balans</p>
                    <p className={`text-lg font-black ${selectedStudent.balance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatNumber(selectedStudent.balance)}
                    </p>
                    {canAdjustBalance && (
                      <button type="button" onClick={() => setBalanceTarget({ id: selectedStudent.id, name: selectedStudent.name, balance: selectedStudent.balance })}
                        className="mt-1 text-[11px] font-bold text-blue-600 hover:underline">
                        Balansni tuzatish
                      </button>
                    )}
                  </div>}
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Holat</p>
                    <p className="text-lg font-black text-blue-600">{selectedStudent.status}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Aloqa Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Phone size={16} className="text-zinc-400" />
                        {selectedStudent.phone}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Mail size={16} className="text-zinc-400" />
                        {selectedStudent.email || '—'}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <MapPin size={16} className="text-zinc-400" />
                        {selectedStudent.address}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Ota-ona Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <User size={16} className="text-zinc-400" />
                        {selectedStudent.parentName}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Phone size={16} className="text-zinc-400" />
                        {selectedStudent.parentPhone}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">O'qish Ma'lumotlari</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <BookOpen size={16} className="text-zinc-400" />
                        {selectedStudent.course}
                      </div>
                      <div className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-zinc-300">
                        <Calendar size={16} className="text-zinc-400" />
                        A'zo bo'lgan sana: {selectedStudent.joinedDate}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100 dark:border-zinc-800 pb-2">Eslatmalar</h4>
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl italic">
                      "{selectedStudent.notes || 'Hech qanday eslatma yo\'q'}"
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="secondary" 
                      onClick={() => showToast(`SMS va Telegram orqali xabarnoma ${selectedStudent.name} ga yuborildi!`, 'success')}
                      className="w-full text-xs font-black"
                      leftIcon={<Send size={14} />}
                    >
                      Xabar yuborish
                    </Button>
                    {(selectedStudent.status === 'Bitiruvchi' || selectedStudent.status === 'Faol') && (
                      <Button 
                        variant="secondary" 
                        onClick={() => exportCertificateToPDF(selectedStudent)}
                        className="w-full text-xs font-black"
                        leftIcon={<Download size={14} />}
                      >
                        Sertifikat
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      variant="secondary" 
                      onClick={() => window.open(`/portal/${selectedStudent.id}`, '_blank')}
                      className="w-full text-sm font-black bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      leftIcon={<ExternalLink size={16} />}
                    >
                      Talaba Portali
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/portal/${selectedStudent.id}`);
                        showToast('Havola nusxalandi!', 'success');
                      }}
                      className="text-sm font-black text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    {canManage && <Button 
                      variant="primary"
                      onClick={() => openModal(selectedStudent)}
                      className="flex-1 text-sm font-black"
                    >
                      Tahrirlash
                    </Button>}
                    {canManage && <Button 
                      variant="danger"
                      onClick={() => handleDelete(selectedStudent.id)}
                      className="flex-1 text-sm font-black"
                    >
                      Arxivlash
                    </Button>}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <Modal 
        isOpen={canManage && isModalOpen} 
        onClose={closeModal} 
        title={formData.id ? 'O\'quvchini Tahrirlash' : 'Yangi O\'quvchi Qo\'shish'}
        width="2xl"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Shaxsiy Ma'lumotlar</h4>
              <div className="space-y-3">
                <Input 
                  label="F.I.O *"
                  value={formData.name || ''}
                  onChange={(e) => {
                    setFormData({...formData, name: e.target.value});
                    if (formErrors.name) setFormErrors({...formErrors, name: ''});
                  }}
                  placeholder="Aliyev Vali"
                  error={formErrors.name}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <PhoneInput
                      label="Telefon *"
                      value={formData.phone || ''}
                      onChange={(phone) => {
                        setFormData({...formData, phone});
                        if (formErrors.phone) setFormErrors({...formErrors, phone: ''});
                      }}
                    />
                    {formErrors.phone && <p className="text-xs text-rose-500 mt-1 font-bold">{formErrors.phone}</p>}
                  </div>
                  <Input
                    type="date"
                    label="Tug'ilgan sana"
                    value={formData.birthDate || ''}
                    onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                  />
                </div>
                <Input
                  type="email"
                  autoComplete="off"
                  label="Email"
                  value={formData.email || ''}
                  onChange={(e) => {
                    setFormData({...formData, email: e.target.value});
                    if (formErrors.email) setFormErrors({...formErrors, email: ''});
                  }}
                  placeholder="student@mail.uz"
                  error={formErrors.email}
                />
                <Input
                  label="Manzil"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="Toshkent sh., Chilonzor tumani"
                />
              </div>
            </div>

            {/* Parent Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Ota-ona Ma'lumotlari</h4>
              <div className="space-y-3">
                <Input 
                  label="Ota yoki ona ismi"
                  value={formData.parentName}
                  onChange={(e) => setFormData({...formData, parentName: e.target.value})}
                  placeholder="Aliyev G'ani"
                />
                <div>
                  <PhoneInput
                    label="Ota-ona telefoni"
                    value={formData.parentPhone || ''}
                    onChange={(parentPhone) => {
                      setFormData({...formData, parentPhone});
                      if (formErrors.parentPhone) setFormErrors({...formErrors, parentPhone: ''});
                    }}
                  />
                  {formErrors.parentPhone && <p className="text-xs text-rose-500 mt-1 font-bold">{formErrors.parentPhone}</p>}
                </div>
              </div>
            </div>

            {/* Study Info */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">O'qish Ma'lumotlari</h4>
              <div className="space-y-3">
                <div className="space-y-1.5 flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Guruh</label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => {
                      const g = groupOptions.find((g: any) => g.id === e.target.value);
                      setSelectedGroupId(e.target.value);
                      {
                        const today = toTashkentDate();
                        const gs = (g as any)?.startDate as string | undefined;
                        setGroupStartDate(currentPeriod && currentPeriod.groupId === e.target.value ? currentPeriod.startDate : (gs && gs > today ? gs : today));
                      }
                      if (formErrors.groupStartDate) setFormErrors({ ...formErrors, groupStartDate: '' });
                      // IP-02: guruh tanlash endi balansni `-narx` bilan ustidan
                      // yozmaydi (to'lov/avans tarixini o'chirib yuborardi).
                      setFormData({
                        ...formData,
                        group: g?.name || '',
                        course: g?.course?.name || '',
                      });
                    }}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">Guruhni tanlang...</option>
                    {groupOptions.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.name} — {g.course?.name || 'Kurssiz'} ({g.teacher?.name || "O'qituvchi yo'q"})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-400">Kurs guruh orqali avtomatik aniqlanadi</p>
                </div>
                {selectedGroupId && (() => {
                  const selGroup = groupOptions.find((g: any) => g.id === selectedGroupId) as any;
                  const gStart: string | undefined = selGroup?.startDate || undefined;
                  return (
                    <div className="space-y-1.5 flex flex-col gap-1.5">
                      <label htmlFor="student-group-start" className="text-sm font-bold text-slate-700 dark:text-zinc-300">Guruhda o'qishni boshlagan sana</label>
                      <input id="student-group-start" type="date" value={groupStartDate} min={gStart}
                        onChange={e => { setGroupStartDate(e.target.value); if (formErrors.groupStartDate) setFormErrors({ ...formErrors, groupStartDate: '' }); }}
                        className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium" />
                      {gStart && gStart < toTashkentDate() && groupStartDate !== gStart && (
                        <button type="button" onClick={() => setGroupStartDate(gStart)} className="self-start text-xs font-bold text-blue-600 hover:underline">
                          Guruh boshidan ({gStart})
                        </button>
                      )}
                      {formErrors.groupStartDate
                        ? <p className="text-xs text-rose-500 font-bold">{formErrors.groupStartDate}</p>
                        : <p className="text-[10px] text-zinc-400">Oylik to'lov shu sanadan hisoblanadi (oy o'rtasida boshlasa — qolgan darslar bo'yicha)</p>}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1.5 flex flex-col gap-1.5">
                    <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Holat</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="Faol">Faol</option>
                      <option value="Muzlatilgan">Muzlatilgan</option>
                      <option value="Tark etgan">Tark etgan</option>
                      <option value="Bitiruvchi">Bitiruvchi</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial & Notes */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Moliya va Eslatmalar</h4>
              <div className="space-y-3">
                {formData.id ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Balans</p>
                      <p className={`text-base font-black tabular-nums ${(formData.balance || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatNumber(formData.balance || 0)} so'm</p>
                    </div>
                    {canAdjustBalance && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setBalanceTarget({ id: formData.id!, name: formData.name || '', balance: formData.balance })}>
                        Balansni tuzatish
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 px-4 py-3">
                    Eski qarz yoki oldindan to'langan avans bo'lsa, o'quvchini saqlagandan keyin uning kartasidagi «Balansni tuzatish» orqali sabab bilan kiriting.
                  </p>
                )}
                <div className="space-y-1.5 flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Eslatma</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium min-h-[100px] resize-y"
                    placeholder="Qo'shimcha ma'lumotlar..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
            <Button variant="secondary" onClick={closeModal} type="button">Bekor qilish</Button>
            <Button variant="primary" onClick={handleSave} type="button" leftIcon={<Check size={18} />}>Saqlash</Button>
          </div>
        </div>
      </Modal>
      {/* Tahrirlash oynasidan ochiladi — uning ustida ko'rinishi uchun DOM'da undan keyin turadi (bir xil z-index) */}
      <BalanceAdjustModal
        isOpen={!!balanceTarget}
        onClose={() => setBalanceTarget(null)}
        student={balanceTarget}
        onDone={(newBalance) => {
          if (balanceTarget && formData.id === balanceTarget.id) setFormData(f => ({ ...f, balance: newBalance }));
          if (balanceTarget && selectedStudent?.id === balanceTarget.id) setSelectedStudent(s => s ? { ...s, balance: newBalance } : s);
          void refetch();
        }}
      />
    </div>
  );
}
