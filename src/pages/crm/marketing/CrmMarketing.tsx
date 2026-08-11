import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Megaphone, Target, TrendingUp, DollarSign, X, Edit2, Trash2, PieChart, ExternalLink, Key, Activity, Globe, Zap } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useFirestore } from '../../../hooks/useFirestore';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { StatCard } from '../../../components/ui/StatCard';
import { useToast } from '../../../components/Toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import api from '../../../api/client';
import { formatNumber } from '../../../utils/formatters';

interface Campaign {
  id?: string;
  name: string;
  platform: string;
  budget: number;
  spent: number;
  leads: number;
  // Bazada yo'q — hisoblanadigan haqiqiy konversiya keyingi bosqichda qo'shiladi.
  conversions?: number;
  status: 'Faol' | 'To\'xtatilgan' | 'Yakunlangan';
  startDate: string;
  endDate: string;
}

const PLATFORMS = ['Instagram', 'Facebook', 'Telegram', 'Google', 'YouTube'];

export default function CrmMarketing() {
  const [activeTab, setActiveTab] = useState<'KAMPANIYALAR' | 'ROI'>('KAMPANIYALAR');
  const { showToast } = useToast();

  const { data: campaigns = [], addDocument: addCampaign, updateDocument: updateCampaign, deleteDocument: delCampaign } = useFirestore<Campaign>('campaigns');

  // Modals state
  const [isCampModal, setIsCampModal] = useState(false);
  const [editingCamp, setEditingCamp] = useState<Campaign | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

  const [campForm, setCampForm] = useState<Partial<Campaign>>({
    name: '', platform: 'Instagram', budget: 0, spent: 0, leads: 0, status: 'Faol',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  // ─── Haqiqiy marketing analitikasi (Faza 5) ───────────────────────────────────
  // Endi hech qanday raqam qo'lda kiritilmaydi — /api/marketing dan real vaqtda
  // hisoblab olinadi (Lead.campaignId + Lead.studentId + haqiqiy Payment yozuvlari).
  const [overview, setOverview] = useState<any | null>(null);
  const [bySource, setBySource] = useState<any[]>([]);
  const [byCampaign, setByCampaign] = useState<Record<string, any>>({});
  const [lostReasons, setLostReasons] = useState<any[]>([]);
  const [managerStats, setManagerStats] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    setStatsLoading(true);
    Promise.allSettled([
      api.get('/marketing/overview'),
      api.get('/marketing/by-source'),
      api.get('/marketing/by-campaign'),
      api.get('/marketing/lost-reasons'),
      api.get('/marketing/managers'),
    ]).then(([ov, src, camp, lost, mgr]) => {
      if (ov.status === 'fulfilled') setOverview(ov.value.data);
      if (src.status === 'fulfilled') setBySource(src.value.data || []);
      if (camp.status === 'fulfilled') {
        const map: Record<string, any> = {};
        for (const c of camp.value.data || []) map[c.id] = c;
        setByCampaign(map);
      }
      if (lost.status === 'fulfilled') setLostReasons(lost.value.data || []);
      if (mgr.status === 'fulfilled') setManagerStats(mgr.value.data || []);
    }).finally(() => setStatsLoading(false));
  }, []);

  // KPI Calculations — faqat KAMPANIYALAR tabidagi "platforma o'zi ko'rsatgan" ustunlar uchun
  const safeCampaigns = campaigns || [];
  const totalBudget = safeCampaigns.reduce((acc, c) => acc + (c.budget || 0), 0);
  const totalSpent = safeCampaigns.reduce((acc, c) => acc + (c.spent || 0), 0);
  const totalLeads = safeCampaigns.reduce((acc, c) => acc + (c.leads || 0), 0);
  const realWonTotal = Object.values(byCampaign).reduce((s: number, c: any) => s + (c.won || 0), 0);

  const handleCampSave = async () => {
    try {
      if (editingCamp?.id) await updateCampaign(editingCamp.id, campForm);
      else await addCampaign(campForm as Omit<Campaign, 'id'>);
      setIsCampModal(false);
      showToast('Kampaniya saqlandi', 'success');
    } catch (e) { showToast('Xatolik yuz berdi', 'error'); }
  };

  const confirmDelete = async () => {
    try {
      await delCampaign(deleteConfirm.id);
      showToast('O\'chirildi', 'success');
    } catch { showToast('Xatolik', 'error'); }
    setDeleteConfirm({ open: false, id: '' });
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deleteConfirm.open}
        title="O'chirishni tasdiqlash"
        message="Haqiqatan ham o'chirmoqchimisiz?"
        confirmText="Ha, o'chirish"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: '' })}
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Marketing</h1>
          <p className="text-zinc-500 text-sm font-medium mt-1">Kampaniyalar va ROI kuzatuvi</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/crmtayyorlovmarkaz/automations"
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors"
          >
            <Zap size={14} />
            Avtomatlar
          </Link>
          <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
            {['KAMPANIYALAR', 'ROI'].map((t) => (
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
      </div>

      {/* MUHIM: mode="wait" ISHLATILMAYDI — bu holatda AnimatePresence chiquvchi
          elementning exit animatsiyasi "tugashini" kutadi, lekin bu loyihada
          (React 19 + framer-motion) ba'zan hech qachon signal bermaydi va tab
          almashtirish butunlay bloklanib qoladi (ROI tabi umuman ochilmaydi
          edi — real brauzer klikida ham tasdiqlangan bug). Default (sync)
          rejimda yangi tarkib darhol ko'rinadi, eskisi orqa fonda mustaqil
          so'nadi — animatsiya sal kamroq silliq, lekin hech qachon bloklanmaydi. */}
      <AnimatePresence>
        {activeTab === 'KAMPANIYALAR' && (
          <motion.div key="camps" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard variant="minimal" color="slate" label="Umumiy Budjet" value={formatNumber(totalBudget)} />
              <StatCard variant="minimal" color="rose" label="Reklamaga Sarflandi" value={formatNumber(totalSpent)} />
              <StatCard variant="minimal" color="blue" label="Lidlar" value={totalLeads} />
              <StatCard
                variant="minimal" color="emerald" label="Oqishga kirdi (haqiqiy)"
                value={`${realWonTotal} (${totalLeads ? Math.round((realWonTotal / totalLeads) * 100) : 0}%)`}
              />
            </div>

            <div className="flex justify-between items-center mb-2">
               <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Faol Kampaniyalar</h2>
               <Button onClick={() => { setEditingCamp(null); setCampForm({name:'', platform: 'Instagram', budget:0, spent:0, leads:0, status:'Faol', startDate: new Date().toISOString().split('T')[0], endDate: ''}); setIsCampModal(true); }} leftIcon={<Plus size={18}/>}>
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
                              <span className="font-bold text-sm dark:text-white">{formatNumber(c.spent)}</span>
                              <span className="text-xs text-zinc-400">/ {formatNumber(c.budget)}</span>
                           </div>
                           <div className="w-full max-w-[150px] h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${Math.min((c.spent/(c.budget||1))*100, 100)}%`}}></div>
                           </div>
                        </td>
                        <td className="px-6 py-4">
                           <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full inline-block w-max">Lidlar: {byCampaign[c.id!]?.leadsReal ?? 0} (platforma: {c.leads})</span>
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full inline-block w-max">Kirdi: {byCampaign[c.id!]?.won ?? 0} · ROAS: {byCampaign[c.id!]?.roas ?? 0}x</span>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end gap-2">
                             <button onClick={() => { setEditingCamp(c); setCampForm(c); setIsCampModal(true); }} className="p-2 text-zinc-400 hover:text-blue-500 transition-colors"><Edit2 size={16}/></button>
                             <button onClick={() => setDeleteConfirm({ open: true, id: c.id! })} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors"><Trash2 size={16}/></button>
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
                 <Input type="number" label="Lidlar (platforma ko'rsatkichi)" value={campForm.leads} onChange={e => setCampForm({...campForm, leads: Number(e.target.value)})} />
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
                    <p className="text-blue-200 mb-6 font-medium max-w-sm">So'nggi 30 kun — haqiqiy o'quvchi to'lovlari asosida (Lead → O'quvchi → Payment zanjiri).</p>
                    <div className="inline-flex flex-col bg-white/10 backdrop-blur border border-white/20 p-5 rounded-2xl">
                       <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">ROAS (Daromad / Xarajat)</span>
                       <span className="text-5xl font-black text-emerald-400 mt-1">
                          {statsLoading ? '...' : `${overview?.roas ?? 0}x`}
                       </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="bg-black/20 backdrop-blur p-4 rounded-2xl border border-white/5">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Cost Per Lead (CPL)</span>
                        <span className="text-2xl font-black text-rose-300">{formatNumber(overview?.cpl || 0)} UZS</span>
                     </div>
                     <div className="bg-black/20 backdrop-blur p-4 rounded-2xl border border-white/5">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Cost Per Acquisition (CAC)</span>
                        <span className="text-2xl font-black text-amber-300">{formatNumber(overview?.cac || 0)} UZS</span>
                        <p className="text-xs text-zinc-500 font-medium mt-1">1 mijoz jalb qilish narxi</p>
                     </div>
                     <div className="col-span-2 bg-black/20 backdrop-blur p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                        <div>
                          <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Haqiqiy daromad (to'liq / 90 kunlik)</span>
                          <span className="text-xl font-black text-emerald-400">
                            {formatNumber(overview?.revenue || 0)} UZS
                            <span className="text-sm text-zinc-400 font-bold"> ({formatNumber(overview?.revenueFirst90d || 0)} / 90 kun)</span>
                          </span>
                        </div>
                        <TrendingUp size={32} className="text-white/10" />
                     </div>
                  </div>
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard variant="minimal" color="blue" label="Lidlar (30 kun)" value={overview?.leads ?? 0} sub={overview ? `Oldingi: ${overview.leadsPrev}` : ''} />
                <StatCard variant="minimal" color="emerald" label="Konversiya" value={`${overview?.conversionRate ?? 0}%`} sub={overview ? `Oldingi: ${overview.conversionRatePrev}%` : ''} />
                <StatCard variant="minimal" color="amber" label="O'rtacha javob vaqti" value={overview?.avgFirstResponseMin != null ? `${overview.avgFirstResponseMin} daq` : '-'} />
                <StatCard variant="minimal" color="rose" label="SLA buzilishi" value={overview?.slaBreaches ?? 0} sub="Javobsiz qolgan" />
             </div>

             <div className="bg-white dark:bg-[#111118] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                <h3 className="text-lg font-black dark:text-white tracking-tight mb-4 flex gap-2 items-center">
                   <PieChart size={18} className="text-blue-500" />
                   Manba bo'yicha tahlil
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-100 dark:border-zinc-800">
                        <th className="py-2">Manba</th>
                        <th className="py-2 text-right">Lidlar</th>
                        <th className="py-2 text-right">Konversiya</th>
                        <th className="py-2 text-right">O'rt. Ball</th>
                        <th className="py-2 text-right">Daromad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {bySource.map(s => (
                        <tr key={s.source}>
                          <td className="py-2.5 font-bold dark:text-white">{s.source}</td>
                          <td className="py-2.5 text-right font-bold text-zinc-500">{s.leads}</td>
                          <td className="py-2.5 text-right font-bold text-emerald-600">{s.conversionRate}%</td>
                          <td className="py-2.5 text-right font-bold text-zinc-500">{s.avgScore}</td>
                          <td className="py-2.5 text-right font-bold text-blue-600">{formatNumber(s.revenue)}</td>
                        </tr>
                      ))}
                      {bySource.length === 0 && !statsLoading && (
                        <tr><td colSpan={5} className="py-6 text-center text-zinc-400 text-xs font-bold">Ma'lumot yo'q</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-[#111118] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                   <h3 className="text-lg font-black dark:text-white tracking-tight mb-4 flex gap-2 items-center">
                      <Target size={18} className="text-blue-500" />
                      Menejerlar reytingi
                   </h3>
                   <div className="space-y-3">
                     {managerStats.map((m, i) => (
                       <div key={m.userId} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl">
                         <div className="flex items-center gap-3">
                           <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-xs font-black flex items-center justify-center">{i + 1}</span>
                           <span className="font-bold text-sm dark:text-white">{m.name}</span>
                         </div>
                         <div className="flex items-center gap-4 text-xs font-bold">
                           <span className="text-zinc-400">{m.assigned} lid</span>
                           <span className="text-emerald-600">{m.won} yutdi</span>
                           {m.slaBreaches > 0 && <span className="text-rose-500">{m.slaBreaches} SLA</span>}
                         </div>
                       </div>
                     ))}
                     {managerStats.length === 0 && !statsLoading && <p className="text-xs text-zinc-400 text-center py-4">Ma'lumot yo'q</p>}
                   </div>
                </div>

                <div className="bg-white dark:bg-[#111118] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
                   <h3 className="text-lg font-black dark:text-white tracking-tight mb-4 flex gap-2 items-center">
                      <X size={18} className="text-rose-500" />
                      Rad etish sabablari
                   </h3>
                   <div className="space-y-2">
                     {lostReasons.map(r => (
                       <div key={r.reason} className="flex items-center justify-between">
                         <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{r.reason}</span>
                         <div className="flex items-center gap-2">
                           <div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                             <div className="h-full bg-rose-500" style={{ width: `${r.pct}%` }} />
                           </div>
                           <span className="text-xs font-black text-zinc-500 w-10 text-right">{r.count}</span>
                         </div>
                       </div>
                     ))}
                     {lostReasons.length === 0 && !statsLoading && <p className="text-xs text-zinc-400 text-center py-4">Rad etilgan lid yo'q</p>}
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
                    <BarChart data={[{ name: 'Sarflandi', qiymat: overview?.spend || 0 }, { name: 'Haqiqiy Daromad', qiymat: overview?.revenue || 0 }]}>
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
      </AnimatePresence>
    </div>
  );
}
