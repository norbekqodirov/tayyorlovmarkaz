import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, Plus, MoreVertical, Phone, Mail, X, Edit2, Trash2, 
  MessageSquare, Calendar, User, Target, TrendingUp, ChevronRight, 
  Clock, CheckCircle2, AlertCircle, History, FileText, Send, GraduationCap
} from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';
import { useCrmData } from '../../hooks/useCrmData';
import { useToast } from '../../components/Toast';

interface LeadActivity {
  id: string;
  type: 'call' | 'message' | 'meeting' | 'note';
  content: string;
  date: string;
  user: string;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  stage: 'new' | 'contacted' | 'meeting' | 'won' | 'lost';
  source: string;
  course: string;
  score: number; // 0-100
  status: 'hot' | 'warm' | 'cold';
  date: string;
  activities: LeadActivity[];
  notes: string;
}

const STAGES = [
  { id: 'new', name: 'Yangi', color: 'bg-blue-500', border: 'border-blue-200' },
  { id: 'contacted', name: 'Aloqaga chiqildi', color: 'bg-amber-500', border: 'border-amber-200' },
  { id: 'meeting', name: 'Uchrashuv', color: 'bg-purple-500', border: 'border-purple-200' },
  { id: 'won', name: "O'qishni boshladi", color: 'bg-emerald-500', border: 'border-emerald-200' },
  { id: 'lost', name: 'Rad etildi', color: 'bg-rose-500', border: 'border-rose-200' },
];

const SOURCES = ['Instagram', 'Facebook', 'Telegram', 'Vebsayt', 'Tavsiya', 'Banner', 'Boshqa'];

export default function CrmLeads() {
  const { data: leads = [], addDocument, updateDocument, deleteDocument } = useFirestore<Lead>('leads');
  const { addDocument: addStudent } = useFirestore<any>('students');
  const { data: groups = [], updateDocument: updateGroup } = useFirestore<any>('groups');
  const { courses } = useCrmData();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '',
    phone: '',
    email: '',
    stage: 'new',
    source: 'Instagram',
    course: '',
    notes: '',
    score: 50,
    status: 'warm'
  });

  const filteredLeads = useMemo(() => 
    (leads || []).filter(l => 
      (l.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (l.phone || '').includes(searchQuery) ||
      (l.course || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  , [leads, searchQuery]);

  const handleSave = async () => {
    if (!formData.name || !formData.phone) {
      alert('Ism va telefon raqami majburiy!');
      return;
    }

    if (editingLead) {
      const updateData = {
        ...formData,
        date: formData.date || editingLead.date,
        activities: editingLead.activities || [],
      };
      await updateDocument(editingLead.id, updateData);
      if (selectedLead?.id === editingLead.id) {
        setSelectedLead({ ...selectedLead, ...updateData } as Lead);
      }
    } else {
      await addDocument({
        date: new Date().toISOString(),
        ...formData as Omit<Lead, 'id' | 'activities' | 'date'>
      });
    }
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Ushbu lidni o\'chirmoqchimisiz?')) {
      await deleteDocument(id);
      setIsDetailOpen(false);
    }
  };

  const openModal = (lead: Lead | null = null) => {
    if (lead) {
      setEditingLead(lead);
      setFormData(lead);
    } else {
      setEditingLead(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        stage: 'new',
        source: 'Instagram',
        course: '',
        notes: '',
        score: 50,
        status: 'warm'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLead(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('leadId', id);
  };

  const handleDrop = async (e: React.DragEvent, stageId: any) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    await updateDocument(leadId, { stage: stageId });
  };

  const addActivity = async (leadId: string, type: LeadActivity['type'], content: string) => {
    const newActivity: LeadActivity = {
      id: Date.now().toString(),
      type,
      content,
      date: new Date().toISOString(),
      user: 'Admin'
    };
    const lead = (leads || []).find(l => l.id === leadId);
    if (lead) {
      const updatedActivities = [newActivity, ...(lead.activities || [])];
      await updateDocument(leadId, { activities: updatedActivities });
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, activities: updatedActivities });
      }
    }
  };

  const handleConvertToStudent = async (lead: Lead) => {
    if (!selectedGroupId) {
      alert('Iltimos, guruhni tanlang!');
      return;
    }

    const studentId = await addStudent({
      name: lead.name,
      phone: lead.phone,
      email: lead.email || '',
      address: '',
      birthDate: '',
      parentName: '',
      parentPhone: '',
      course: lead.course,
      group: (groups || []).find((g: any) => g.id === selectedGroupId)?.name || '',
      paymentStatus: 'Kutilmoqda',
      balance: 0,
      status: 'Faol',
      joinedDate: new Date().toISOString().split('T')[0],
      notes: lead.notes || `Lid manbasi: ${lead.source}`
    });
    
    // Add student to group
    const group = (groups || []).find((g: any) => g.id === selectedGroupId);
    if (group) {
      const updatedStudents = [...(group.students || []), studentId];
      await updateGroup(selectedGroupId, { students: updatedStudents });
    }

    // Mark lead as won
    await updateDocument(lead.id, { stage: 'won' });
    
    alert(`${lead.name} muvaffaqiyatli o'quvchilar ro'yxatiga va guruhga qo'shildi!`);
    setIsConvertModalOpen(false);
    setIsDetailOpen(false);
    setSelectedGroupId('');
  };

  const getStatusColor = (status: Lead['status']) => {
    switch (status) {
      case 'hot': return 'text-rose-600 bg-rose-100 dark:bg-rose-900/30';
      case 'warm': return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
      case 'cold': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Lidlar Boshqaruvi</h1>
          <p className="text-zinc-500 text-sm font-medium">Sotuv voronkasi va marketing tahlili</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            <button 
              onClick={() => setView('kanban')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${view === 'kanban' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}
            >
              Kanban
            </button>
            <button 
              onClick={() => setView('list')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${view === 'list' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-500'}`}
            >
              Ro'yxat
            </button>
          </div>
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} />
            Yangi Lid
          </button>
        </div>
      </div>

      {/* Analytics Mini Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
            <Target size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Jami</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{(leads || []).length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Issiq (Hot)</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{(leads || []).filter(l => l.status === 'hot').length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Yutilgan</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{(leads || []).filter(l => l.stage === 'won').length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Konversiya</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">
              {(leads || []).length > 0 ? Math.round(((leads || []).filter(l => l.stage === 'won').length / (leads || []).length) * 100) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Lid ismi, raqami yoki kurs bo'yicha qidirish..." 
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
        </div>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-black text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <Filter size={18} />
          Filtrlar
        </button>
      </div>

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-6 min-w-max h-full">
            {STAGES.map(stage => (
              <div 
                key={stage.id} 
                className="w-80 flex flex-col bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
                    <h3 className="font-black text-slate-900 dark:text-white tracking-tight">{stage.name}</h3>
                  </div>
                  <span className="bg-white dark:bg-zinc-800 text-zinc-500 text-[10px] font-black px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm">
                    {filteredLeads.filter(l => l.stage === stage.id).length}
                  </span>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {filteredLeads.filter(l => l.stage === stage.id).map((lead) => (
                    <motion.div 
                      key={lead.id} 
                      layoutId={lead.id}
                      draggable
                      onDragStartCapture={(e) => handleDragStart(e as any, lead.id)}
                      onClick={() => { setSelectedLead(lead); setIsDetailOpen(true); }}
                      className="bg-white dark:bg-zinc-800 p-4 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 cursor-grab active:cursor-grabbing hover:border-blue-500 dark:hover:border-blue-500 transition-all group relative overflow-hidden"
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full ${stage.color}`}></div>
                      
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-black text-sm text-slate-900 dark:text-white tracking-tight">{lead.name}</h4>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">{lead.course}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${getStatusColor(lead.status)}`}>
                          {lead.status}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                          <Phone size={12} className="text-zinc-400" />
                          {lead.phone}
                        </div>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-700/50">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-[10px] font-black text-zinc-400">
                              {lead.score}
                            </div>
                            <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${lead.score}%` }}></div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-400">
                            <History size={10} />
                            { (lead.activities || []).length }
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
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
                {filteredLeads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    onClick={() => { setSelectedLead(lead); setIsDetailOpen(true); }}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-black text-zinc-500">
                          {lead.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 dark:text-white tracking-tight">{lead.name}</p>
                          <p className="text-xs font-bold text-zinc-500">{lead.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-zinc-600 dark:text-zinc-400">{lead.course}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${STAGES.find(s => s.id === lead.stage)?.color}`}></div>
                        <span className="font-bold">{STAGES.find(s => s.id === lead.stage)?.name}</span>
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
                        onClick={(e) => { e.stopPropagation(); openModal(lead); }}
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
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {isDetailOpen && selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="w-full max-w-2xl h-full bg-white dark:bg-zinc-900 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black">
                    {selectedLead.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{selectedLead.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${getStatusColor(selectedLead.status)}`}>
                        {selectedLead.status}
                      </span>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{selectedLead.course}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedLead.stage === 'won' && (
                    <button 
                      onClick={() => setIsConvertModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-600/20"
                    >
                      <GraduationCap size={16} />
                      O'quvchiga aylantirish
                    </button>
                  )}
                  <button onClick={() => openModal(selectedLead)} className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"><Edit2 size={20}/></button>
                  <button onClick={() => handleDelete(selectedLead.id)} className="p-2 text-zinc-400 hover:text-rose-600 transition-colors"><Trash2 size={20}/></button>
                  <button onClick={() => setIsDetailOpen(false)} className="p-2 text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors ml-4"><X size={24}/></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Quick Info Grid */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Telefon</p>
                    <a href={`tel:${selectedLead.phone}`} className="text-sm font-bold text-blue-600 flex items-center gap-2">
                      <Phone size={14} /> {selectedLead.phone}
                    </a>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Email</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Mail size={14} className="text-zinc-400" /> {selectedLead.email || 'Kiritilmagan'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Manba</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedLead.source}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Qo'shilgan sana</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{new Date(selectedLead.date).toLocaleDateString('uz-UZ')}</p>
                  </div>
                </div>

                {/* Score Section */}
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Lid Balli (Score)</h3>
                    <span className="text-2xl font-black text-blue-600">{selectedLead.score}</span>
                  </div>
                  <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedLead.score}%` }}
                      className="h-full bg-blue-600"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-zinc-500 mt-3 italic">
                    * Ball lidning faolligi va qiziqishi asosida avtomatik hisoblanadi.
                  </p>
                </div>

                {/* Activities Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Faolliklar Tarixi</h3>
                    <div className="flex gap-2">
                      <button onClick={() => addActivity(selectedLead.id, 'call', 'Telefon orqali bog\'lanildi')} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 hover:text-blue-600 transition-all"><Phone size={16}/></button>
                      <button onClick={() => addActivity(selectedLead.id, 'message', 'Telegramdan xabar yozildi')} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 hover:text-blue-600 transition-all"><Send size={16}/></button>
                      <button onClick={() => addActivity(selectedLead.id, 'meeting', 'Uchrashuv o\'tkazildi')} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-zinc-600 hover:text-blue-600 transition-all"><Calendar size={16}/></button>
                    </div>
                  </div>

                  <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-100 dark:before:bg-zinc-800">
                    {(selectedLead.activities || []).map((activity) => (
                      <div key={activity.id} className="relative pl-10">
                        <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 flex items-center justify-center z-10">
                          {activity.type === 'call' && <Phone size={14} className="text-blue-500" />}
                          {activity.type === 'message' && <MessageSquare size={14} className="text-emerald-500" />}
                          {activity.type === 'meeting' && <Calendar size={14} className="text-purple-500" />}
                          {activity.type === 'note' && <FileText size={14} className="text-amber-500" />}
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-xs font-black text-slate-900 dark:text-white">{activity.content}</p>
                            <span className="text-[10px] font-bold text-zinc-400">{new Date(activity.date).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                            <User size={10} /> {activity.user} • {new Date(activity.date).toLocaleDateString('uz-UZ')}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(selectedLead.activities || []).length === 0 && (
                      <div className="pl-10 text-zinc-400 text-sm italic py-4">Hozircha faolliklar yo'q...</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    placeholder="Eslatma yozish..."
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addActivity(selectedLead.id, 'note', (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                  <button className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm shadow-lg shadow-blue-600/20">
                    Saqlash
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Convert to Student Modal */}
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
                    onChange={(e) => setSelectedGroupId(e.target.value)}
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
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-600/20"
                >
                  Aylantirish
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {editingLead ? 'Lidni Tahrirlash' : 'Yangi Lid Qo\'shish'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ism Familiya</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="Masalan: Alisher Navoiy"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Telefon</label>
                    <input 
                      type="text" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="+998 90 123 45 67"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Email (Ixtiyoriy)</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                      placeholder="example@mail.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Kurs</label>
                    <select 
                      value={formData.course}
                      onChange={(e) => setFormData({...formData, course: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="">Kursni tanlang...</option>
                      {courses.map((c: any) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Manba</label>
                    <select 
                      value={formData.source}
                      onChange={(e) => setFormData({...formData, source: e.target.value})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
                    >
                      <option value="hot">Issiq (Hot)</option>
                      <option value="warm">Iliq (Warm)</option>
                      <option value="cold">Sovuq (Cold)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Eslatma</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white resize-none"
                    rows={3}
                    placeholder="Lid haqida qo'shimcha ma'lumotlar..."
                  />
                </div>
              </div>

              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 bg-zinc-50 dark:bg-zinc-900/50">
                <button 
                  onClick={closeModal}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  Bekor qilish
                </button>
                <button 
                  onClick={handleSave}
                  className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-600/20"
                >
                  Saqlash
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
