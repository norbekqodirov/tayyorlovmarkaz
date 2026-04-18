import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Megaphone, Target, TrendingUp, DollarSign, X, Edit2, Trash2, PieChart, ExternalLink, Zap, Key, Activity, Bot, Share2, Globe, Send } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useFirestore } from '../../hooks/useFirestore';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';

interface Campaign {
  id?: string;
  name: string;
  platform: string;
  budget: number;
  spent: number;
  leads: number;
  conversions: number;
  status: 'Faol' | 'To\'xtatilgan' | 'Yakunlangan';
  startDate: string;
  endDate: string;
}

interface Automation {
  id?: string;
  name: string;
  trigger: string;
  action: string;
  webhookUrl: string;
  payloadTemplate: string;
  status: 'Faol' | 'To\'xtatilgan';
}

const PLATFORMS = ['Instagram', 'Facebook', 'Telegram', 'Google', 'YouTube'];
const TRIGGERS = ['Yangi Lid Tushganda', 'To\'lov Kechikkanda', 'Lid Muzlatilganda', 'Davomat 3 marta qoldirilganda'];
const ACTIONS = ['Telegram orqali Xabar', 'SMS Yuborish', 'CRM da Bildirishnoma'];

export default function CrmMarketing() {
  const [activeTab, setActiveTab] = useState<'KAMPANIYALAR' | 'ROI' | 'AVTOMATIZATSIYA'>('KAMPANIYALAR');
  const { showToast } = useToast();

  const { data: campaigns = [], addDocument: addCampaign, updateDocument: updateCampaign, deleteDocument: delCampaign } = useFirestore<Campaign>('campaigns');
  const { data: automations = [], addDocument: addAuto, updateDocument: updateAuto, deleteDocument: delAuto } = useFirestore<Automation>('automations');
  const { data: students = [] } = useFirestore<any>('students'); // Real data mapping for ROI

  // Modals state
  const [isCampModal, setIsCampModal] = useState(false);
  const [isAutoModal, setIsAutoModal] = useState(false);
  const [editingCamp, setEditingCamp] = useState<Campaign | null>(null);
  const [editingAuto, setEditingAuto] = useState<Automation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'camp' | 'auto'; id: string }>({ open: false, type: 'camp', id: '' });

  const [campForm, setCampForm] = useState<Partial<Campaign>>({
    name: '', platform: 'Instagram', budget: 0, spent: 0, leads: 0, conversions: 0, status: 'Faol',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  const [autoForm, setAutoForm] = useState<Partial<Automation>>({
    name: '', trigger: 'Yangi Lid Tushganda', action: 'Telegram orqali Xabar', webhookUrl: '', payloadTemplate: '{"text": "Yangi xabar!"}', status: 'Faol'
  });

  // KPI Calculations
  const safeCampaigns = campaigns || [];
  const totalBudget = safeCampaigns.reduce((acc, c) => acc + (c.budget || 0), 0);
  const totalSpent = safeCampaigns.reduce((acc, c) => acc + (c.spent || 0), 0);
  const totalLeads = safeCampaigns.reduce((acc, c) => acc + (c.leads || 0), 0);
  const avgCPL = totalSpent / (totalLeads || 1);
  const totalConversions = safeCampaigns.reduce((acc, c) => acc + (c.conversions || 0), 0);
  
  // Real ROI logic (Assumption: 1 conversion = average 800,000 UZS lifetime value, could map from actual student database)
  const estimatedRevenue = totalConversions * 800000;
  const overallROI = totalSpent > 0 ? ((estimatedRevenue - totalSpent) / totalSpent) * 100 : 0;
  const avgCAC = totalSpent / (totalConversions || 1);

  const handleCampSave = async () => {
    try {
      if (editingCamp?.id) await updateCampaign(editingCamp.id, campForm);
      else await addCampaign(campForm as Omit<Campaign, 'id'>);
      setIsCampModal(false);
      showToast('Kampaniya saqlandi', 'success');
    } catch (e) { showToast('Xatolik yuz berdi', 'error'); }
  };

  const handleAutoSave = async () => {
    try {
      if (editingAuto?.id) await updateAuto(editingAuto.id, autoForm);
      else await addAuto(autoForm as Omit<Automation, 'id'>);
      setIsAutoModal(false);
      showToast('Avtomatizatsiya qoidasi saqlandi', 'success');
    } catch (e) { showToast('Xatolik', 'error'); }
  };

  const confirmDelete = async () => {
    try {
      if (deleteConfirm.type === 'camp') await delCampaign(deleteConfirm.id);
      else await delAuto(deleteConfirm.id);
      showToast('O\'chirildi', 'success');
    } catch { showToast('Xatolik', 'error'); }
    setDeleteConfirm({ open: false, type: 'camp', id: '' });
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="O'chirishni tasdiqlash"
        message="Haqiqatan ham o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, type: 'camp', id: '' })}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Marketing va Avtomatizatsiya</h1>
          <p className="text-zinc-500 text-sm font-medium mt-1">ROI kuzatuvi, e'lonlar va Webhook triggerlar markazi</p>
        </div>
        <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
          {['KAMPANIYALAR', 'ROI', 'AVTOMATIZATSIYA'].map((t) => (
             <button 
                key={t}
                onClick={() => setActiveTab(t as any)}
                className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === t ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
             >
                {t}
             </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'KAMPANIYALAR' && (
          <motion.div key="camps" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#111118] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Umumiy Budjet</p>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {new Intl.NumberFormat('uz-UZ').format(totalBudget)}
                </h3>
              </div>
              <div className="bg-white dark:bg-[#111118] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Reklamaga Sarflandi</p>
                <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {new Intl.NumberFormat('uz-UZ').format(totalSpent)}
                </h3>
              </div>
              <div className="bg-white dark:bg-[#111118] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Lidlar</p>
                <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400">{totalLeads}</h3>
              </div>
              <div className="bg-white dark:bg-[#111118] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Oqishga kirdi (Konversiya)</p>
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{totalConversions} <span className="text-sm font-bold text-zinc-400">({totalLeads ? Math.round((totalConversions/totalLeads)*100) : 0}%)</span></h3>
              </div>
            </div>

            <div className="flex justify-between items-center mb-2">
               <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Faol Kampaniyalar</h2>
               <Button onClick={() => { setEditingCamp(null); setCampForm({name:'', platform: 'Instagram', budget:0, spent:0, leads:0, conversions:0, status:'Faol', startDate: new Date().toISOString().split('T')[0], endDate: ''}); setIsCampModal(true); }} leftIcon={<Plus size={18}/>}>
                  Yangi Kampaniya
               </Button>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
               <table className="w-full text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                    <tr>
                       <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nomi / Platforma</th>
                       <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Budjet / Sarf</th>
                       <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Natija</th>
                       <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {safeCampaigns.map(c => (
                      <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                        <td className="px-6 py-4">
                           <p className="font-bold text-slate-900 dark:text-white">{c.name}</p>
                           <p className="text-xs font-medium text-zinc-500 mt-1">{c.platform}</p>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-sm dark:text-white">{new Intl.NumberFormat('uz-UZ').format(c.spent)}</span>
                              <span className="text-xs text-zinc-400">/ {new Intl.NumberFormat('uz-UZ').format(c.budget)}</span>
                           </div>
                           <div className="w-full max-w-[150px] h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${Math.min((c.spent/(c.budget||1))*100, 100)}%`}}></div>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full inline-block w-max">Lidlar: {c.leads}</span>
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full inline-block w-max">Kirdi: {c.conversions}</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end gap-2">
                             <button onClick={() => { setEditingCamp(c); setCampForm(c); setIsCampModal(true); }} className="p-2 text-zinc-400 hover:text-blue-500 transition-colors"><Edit2 size={16}/></button>
                             <button onClick={() => setDeleteConfirm({ open: true, type: 'camp', id: c.id! })} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors"><Trash2 size={16}/></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>

            <Modal isOpen={isCampModal} onClose={() => setIsCampModal(false)} title="Kampaniya tahriri">
               <div className="space-y-4">
                 <Input label="Kampaniya nomi" value={campForm.name} onChange={e => setCampForm({...campForm, name: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex flex-col">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Platforma</label>
                      <select value={campForm.platform} onChange={e => setCampForm({...campForm, platform: e.target.value})} className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 text-slate-800 dark:text-white transition-colors">
                        {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                   </div>
                   <div className="space-y-1.5 flex flex-col">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                      <select value={campForm.status} onChange={e => setCampForm({...campForm, status: e.target.value as any})} className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500 text-slate-800 dark:text-white transition-colors">
                        <option value="Faol">Faol</option>
                        <option value="To'xtatilgan">To'xtatilgan</option>
                        <option value="Yakunlangan">Yakunlangan</option>
                      </select>
                   </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <Input type="number" label="Budjet" value={campForm.budget} onChange={e => setCampForm({...campForm, budget: Number(e.target.value)})} />
                   <Input type="number" label="Sarflandi" value={campForm.spent} onChange={e => setCampForm({...campForm, spent: Number(e.target.value)})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <Input type="number" label="Lidlar" value={campForm.leads} onChange={e => setCampForm({...campForm, leads: Number(e.target.value)})} />
                   <Input type="number" label="O'qishga kirdi (Konversiya)" value={campForm.conversions} onChange={e => setCampForm({...campForm, conversions: Number(e.target.value)})} />
                 </div>
                 <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                   <Button variant="secondary" onClick={() => setIsCampModal(false)}>Bekor qilish</Button>
                   <Button variant="primary" onClick={handleCampSave}>Saqlash</Button>
                 </div>
               </div>
            </Modal>
          </motion.div>
        )}

        {activeTab === 'ROI' && (
          <motion.div key="roi" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
             <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
               <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
               <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h2 className="text-3xl font-black mb-2 tracking-tight">Sarmoya Qaytimi (ROI) Tahlili</h2>
                    <p className="text-blue-200 mb-6 font-medium max-w-sm">Biznesingizning reklama harajatlaridan ko'rayotgan aniq foydasi. Daromad / Xarajat nisbati asosida.</p>
                    <div className="inline-flex flex-col bg-white/10 backdrop-blur border border-white/20 p-5 rounded-2xl">
                       <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Net Marketing ROI %</span>
                       <span className="text-5xl font-black text-emerald-400 mt-1">
                          {overallROI.toFixed(1)}% {overallROI > 0 ? '↑' : '↓'}
                       </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-black/20 backdrop-blur p-4 rounded-2xl border border-white/5">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Cost Per Lead (CPL)</span>
                        <span className="text-2xl font-black text-rose-300">{new Intl.NumberFormat('uz-UZ').format(avgCPL)} UZS</span>
                     </div>
                     <div className="bg-black/20 backdrop-blur p-4 rounded-2xl border border-white/5">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Cost Per Acquisition (CAC)</span>
                        <span className="text-2xl font-black text-amber-300">{new Intl.NumberFormat('uz-UZ').format(avgCAC)} UZS</span>
                        <p className="text-xs text-zinc-500 font-medium mt-1">1 mijoz jalb qilish narxi</p>
                     </div>
                     <div className="col-span-2 bg-black/20 backdrop-blur p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                        <div>
                          <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Mijozning Estimat Yechimi (LTV)</span>
                          <span className="text-xl font-black text-emerald-400">~ 800,000 UZS / kurs</span>
                        </div>
                        <TrendingUp size={32} className="text-white/10" />
                     </div>
                  </div>
               </div>
             </div>

             <div className="bg-white dark:bg-[#111118] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                <h3 className="text-lg font-black dark:text-white tracking-tight mb-4 flex gap-2 items-center">
                   <Activity size={18} className="text-blue-500" />
                   Daromad va Xarajat Solishtirmasi
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ name: 'Sarflandi', qiymat: totalSpent }, { name: 'Kutilayotgan Daromad', qiymat: estimatedRevenue }]}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                       <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#888', fontWeight: 700}}/>
                       <YAxis axisLine={false} tickLine={false} tick={{fill: '#888'}}/>
                       <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '16px', border: '1px solid #333', background: '#000'}} />
                       <Bar dataKey="qiymat" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                         <Cell key="cell-0" fill="#f43f5e" />
                         <Cell key="cell-1" fill="#10b981" />
                       </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </motion.div>
        )}

        {activeTab === 'AVTOMATIZATSIYA' && (
          <motion.div key="auto" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
             <div className="flex justify-between items-center bg-indigo-50 border border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-500/20 p-6 rounded-3xl">
                <div>
                   <h2 className="text-lg font-black text-indigo-900 dark:text-indigo-300 tracking-tight flex items-center gap-2">
                     <Zap size={20} className="text-indigo-500" />
                     Webhook Triggerlari
                   </h2>
                   <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400 mt-1 max-w-xl">
                      Voqealar asosida tashqi tizimlarga (Telegram botlar, SMS xizmatlar) avtomatlashgan xabar yuborish mexanizmi.
                   </p>
                </div>
                <Button onClick={() => { setEditingAuto(null); setAutoForm({name:'', trigger: TRIGGERS[0], action: ACTIONS[0], webhookUrl:'', payloadTemplate:'{"text": "Salom {{name}}!"}', status:'Faol'}); setIsAutoModal(true); }} leftIcon={<Plus size={18}/>}>
                   Yangi Avtomatika
                </Button>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {automations.map(a => (
                  <div key={a.id} className="bg-white dark:bg-[#111118] border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl relative overflow-hidden group">
                     {a.status === 'Faol' ? (
                       <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                     ) : (
                       <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-zinc-500"></span>
                     )}
                     <Bot className="text-indigo-500 mb-3" size={24} />
                     <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">{a.name}</h3>
                     
                     <div className="mt-4 space-y-2">
                       <div className="flex items-center gap-3">
                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                         <span className="text-xs font-bold text-zinc-500 truncate">{a.trigger}</span>
                       </div>
                       <div className="flex items-center gap-3">
                         <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                         <span className="text-xs font-bold text-zinc-500 truncate">{a.action}</span>
                       </div>
                     </div>

                     <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingAuto(a); setAutoForm(a); setIsAutoModal(true); }} className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors">Tahrirlash</button>
                        <button onClick={() => setDeleteConfirm({ open: true, type: 'auto', id: a.id! })} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors ml-2">O'chirish</button>
                     </div>
                  </div>
                ))}
                
                {automations.length === 0 && (
                   <div className="col-span-full py-16 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl flex flex-col items-center">
                     <Share2 size={48} className="text-zinc-300 dark:text-zinc-700 mb-4" />
                     <h3 className="text-lg font-black text-slate-900 dark:text-white">Avtomatika qo'shilmagan</h3>
                     <p className="text-zinc-500 text-sm mt-2 max-w-sm">Tizimdagi uzilish va kechikishlarni oldini olish uchun xabarnoma botlarini ulang.</p>
                   </div>
                )}
             </div>

             <Modal isOpen={isAutoModal} onClose={() => setIsAutoModal(false)} title="Webhook Avtomatizatsiya">
                <div className="space-y-4">
                   <Input label="Qoida Nomi" value={autoForm.name} onChange={e => setAutoForm({...autoForm, name: e.target.value})} placeholder="Masalan: To'lov kelmaganligi haqida SMS" />
                   
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Trigger (Qachon ishlaydi?)</label>
                        <select value={autoForm.trigger} onChange={e => setAutoForm({...autoForm, trigger: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none dark:text-white">
                           {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Action (Nima ro'y beradi?)</label>
                        <select value={autoForm.action} onChange={e => setAutoForm({...autoForm, action: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none dark:text-white">
                           {ACTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                     </div>
                   </div>

                   <Input type="url" label="Webhook URL (Target REST API endpoint)" value={autoForm.webhookUrl} onChange={e => setAutoForm({...autoForm, webhookUrl: e.target.value})} placeholder="https://api.telegram.org/bot<TOKEN>/sendMessage" />

                   <div className="space-y-1.5 flex flex-col">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex justify-between">
                         Payload Pattern (JSON formati)
                         <span className="text-blue-500 lowercase">O'zgaruvchilar: {'{{name}}'}, {'{{phone}}'}, {'{{balance}}'}</span>
                      </label>
                      <textarea 
                         value={autoForm.payloadTemplate} 
                         onChange={e => setAutoForm({...autoForm, payloadTemplate: e.target.value})} 
                         className="w-full px-4 py-3 bg-zinc-950 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none border border-zinc-800 min-h-[120px]" 
                      />
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Holat</label>
                      <select value={autoForm.status} onChange={e => setAutoForm({...autoForm, status: e.target.value as any})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-bold focus:outline-none dark:text-white">
                         <option value="Faol">Faol</option>
                         <option value="To'xtatilgan">To'xtatilgan</option>
                      </select>
                   </div>

                   <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                     <Button variant="secondary" onClick={() => setIsAutoModal(false)}>Bekor qilish</Button>
                     <Button variant="primary" onClick={handleAutoSave} leftIcon={<Send size={16}/>}>Saqlash - Test</Button>
                   </div>
                </div>
             </Modal>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
