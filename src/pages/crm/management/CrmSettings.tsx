import { useState, useEffect } from 'react';
import { Save, User, Lock, Bell, Globe, Database, Download, HardDrive } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { PhoneInput } from '../../../components/ui/PhoneInput';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

export default function CrmSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { showToast } = useToast();
  const { documents: settingsDocs, updateDocument: updateSetting, addDocument: addSetting } = useFirestore<any>('settings');
  const [systemStats, setSystemStats] = useState<any>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const { documents: pageDocs, updateDocument: updatePage, addDocument: addPage } = useFirestore<any>('pageContent');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [leadExtraFieldType, setLeadExtraFieldType] = useState<'none' | 'age' | 'grade'>('none');
  const [leadFieldSaving, setLeadFieldSaving] = useState(false);
  const [leadSettings, setLeadSettings] = useState({ mode: 'on', pool: [] as string[], slaMinutes: 30, workStart: '09:00', workEnd: '19:00' });
  const [leadSettingsSaving, setLeadSettingsSaving] = useState(false);
  const [assignableManagers, setAssignableManagers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [billingSettings, setBillingSettings] = useState({ lessonsPerMonth: 12, absenceThreshold: 3, teacherSalaryPercent: 40 });
  const [billingSaving, setBillingSaving] = useState(false);
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  const [profileData, setProfileData] = useState({
    name: '',
    phone: '',
    email: '',
  });

  const [siteData, setSiteData] = useState({
    siteName: 'Tayyorlov Markazi',
    contactPhone: '+998 90 123 45 67',
    address: 'Toshkent shahar, Chilonzor tumani',
    instagram: 'https://instagram.com/tayyorlov',
    telegram: 'https://t.me/tayyorlov'
  });

  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [landingData, setLandingData] = useState({
    heroTitle: 'Farzandingiz kelajagini biz bilan quring',
    heroSubtitle: 'Prezident maktablari va nufuzli oliygohlarga kafolatlangan tayyorgarlik. Zamonaviy metodika va kuchli ustozlar jamoasi.',
    stat1Value: '95%', stat1Label: 'Prezident maktablariga qabul',
    stat2Value: '500+', stat2Label: 'Muvaffaqiyatli bitiruvchilar',
    stat3Value: '4 oy', stat3Label: "O'rtacha tayyorgarlik vaqti",
    stat4Value: '100%', stat4Label: "Sifat nazorati va kafolat"
  });

  // Load current user profile from /auth/me
  useEffect(() => {
    api.get('/auth/me').then(res => {
      const user = res.data;
      setCurrentUser(user);
      const nameParts = (user.name || '').split(' ');
      setProfileData({
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (settingsDocs.length > 0) {
      const siteInfo = settingsDocs.find((doc: any) => doc.key === 'site' || doc.id === 'site');
      if (siteInfo) setSiteData(prev => ({ ...prev, ...siteInfo }));
    }
  }, [settingsDocs]);

  useEffect(() => {
    if (pageDocs.length > 0) {
      const homeInfo = pageDocs.find((doc) => doc.id === 'home');
      if (homeInfo) {
        setLandingData(prev => ({ ...prev, ...homeInfo }));
      }
    }
  }, [pageDocs]);

  useEffect(() => {
    api.get('/public/lead-form-config').then(res => setLeadExtraFieldType(res.data?.type || 'none')).catch(() => {});
    api.get('/leads/settings').then(res => setLeadSettings(res.data)).catch(() => {});
    api.get('/leads/assignable-users').then(res => setAssignableManagers(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/finance/billing-settings').then(res => setBillingSettings(res.data)).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      if (activeTab === 'profile') {
        if (currentUser?.id) {
          await api.put(`/auth/users/${currentUser.id}`, {
            name: profileData.name,
            phone: profileData.phone,
            email: profileData.email,
          });
          // Update cached user in localStorage
          const stored = JSON.parse(localStorage.getItem('crm_user') || '{}');
          localStorage.setItem('crm_user', JSON.stringify({ ...stored, name: profileData.name, phone: profileData.phone, email: profileData.email }));
        }
        showToast("Profil ma'lumotlari saqlandi!", 'success');
      } else if (activeTab === 'site') {
        const siteExists = settingsDocs.some(doc => doc.id === 'site');
        if (siteExists) {
          await updateSetting('site', siteData);
        } else {
          await addSetting({ id: 'site', ...siteData });
        }
        showToast("Sayt ma'lumotlari saqlandi!", 'success');
      } else if (activeTab === 'security') {
        if (!securityData.currentPassword) {
          showToast("Joriy parolni kiriting!", 'error');
          return;
        }
        if (securityData.newPassword !== securityData.confirmPassword) {
          showToast("Yangi parollar mos tushmadi!", 'error');
          return;
        }
        if (securityData.newPassword.length < 6) {
          showToast("Parol kamida 6 ta belgidan iborat bo'lishi kerak!", 'error');
          return;
        }
        try {
          await api.put('/auth/change-password', {
            currentPassword: securityData.currentPassword,
            newPassword: securityData.newPassword
          });
          showToast("Parol muvaffaqiyatli o'zgartirildi!", 'success');
          setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
          showToast(err.response?.data?.message || "Parolni o'zgartirishda xatolik yuz berdi!", 'error');
          return;
        }
      } else if (activeTab === 'landing') {
        const landingExists = pageDocs.some(doc => doc.id === 'home');
        if (landingExists) {
          await updatePage('home', landingData);
        } else {
          await addPage({ id: 'home', ...landingData });
        }
        showToast("Bosh sahifa ma'lumotlari saqlandi!", 'success');
      } else if (activeTab === 'leads') {
        setLeadFieldSaving(true);
        try {
          await api.put('/public/lead-form-config', { type: leadExtraFieldType });
          if (isAdmin) {
            setLeadSettingsSaving(true);
            try {
              await api.put('/leads/settings', leadSettings);
            } finally {
              setLeadSettingsSaving(false);
            }
          }
          showToast("Lid sozlamalari saqlandi!", 'success');
        } finally {
          setLeadFieldSaving(false);
        }
      } else if (activeTab === 'billing') {
        setBillingSaving(true);
        try {
          const res = await api.put('/finance/billing-settings', billingSettings);
          setBillingSettings(res.data);
          showToast("To'lov hisob-kitobi sozlamalari saqlandi!", 'success');
        } finally {
          setBillingSaving(false);
        }
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      showToast("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
  };
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Sozlamalar</h1>
        <Button onClick={handleSave} leftIcon={<Save size={18} />}>
          Saqlash
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Settings Navigation */}
        <div className="col-span-1 space-y-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'profile' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <User size={18} />
            Profil sozlamalari
          </button>
          <button
            onClick={() => setActiveTab('site')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'site' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Globe size={18} />
            Sayt ma'lumotlari
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'security' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Lock size={18} />
            Xavfsizlik
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'notifications' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Bell size={18} />
            Bildirishnomalar
          </button>
          <button
            onClick={() => setActiveTab('landing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'landing' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Globe size={18} />
            Bosh Sahifa
          </button>
          <button
            onClick={() => {
              setActiveTab('backup');
              api.get('/auth/stats').then(res => setSystemStats(res.data)).catch(() => {});
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'backup' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Database size={18} />
            Backup
          </button>
          <button
            onClick={() => setActiveTab('leads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'leads' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Bell size={18} />
            Lid Forma
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors text-left ${activeTab === 'billing' ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700' : 'bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'}`}
          >
            <Database size={18} />
            To'lov / Davomat
          </button>
        </div>

        {/* Settings Content */}
        <div className="col-span-1 md:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          {activeTab === 'profile' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Profil ma'lumotlari</h2>

              <div className="space-y-5">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-2xl font-black border-2 border-dashed border-zinc-300 dark:border-zinc-700">
                    {(profileData.name || 'A').charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{profileData.name || 'Administrator'}</p>
                    <p className="text-xs text-zinc-500">{profileData.phone || profileData.email || ''}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Input label="To'liq ism" value={profileData.name} onChange={(e) => setProfileData({ ...profileData, name: e.target.value })} />
                  <PhoneInput label="Telefon raqam" value={profileData.phone} onChange={(phone) => setProfileData({ ...profileData, phone })} />
                </div>

                <Input type="email" label="Email" value={profileData.email} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} />
              </div>
            </>
          )}

          {activeTab === 'site' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Sayt ma'lumotlari</h2>
              <div className="space-y-5">
                <Input label="Sayt nomi" value={siteData.siteName} onChange={(e) => setSiteData({ ...siteData, siteName: e.target.value })} />
                <PhoneInput label="Aloqa telefoni" value={siteData.contactPhone} onChange={(contactPhone) => setSiteData({ ...siteData, contactPhone })} />
                <Input label="Manzil" value={siteData.address} onChange={(e) => setSiteData({ ...siteData, address: e.target.value })} />
                <Input type="url" label="Instagram URL" value={siteData.instagram} onChange={(e) => setSiteData({ ...siteData, instagram: e.target.value })} />
                <Input type="url" label="Telegram URL" value={siteData.telegram} onChange={(e) => setSiteData({ ...siteData, telegram: e.target.value })} />
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Xavfsizlik</h2>
              <div className="space-y-5">
                <Input type="password" label="Joriy parol" value={securityData.currentPassword} onChange={(e) => setSecurityData({ ...securityData, currentPassword: e.target.value })} />
                <Input type="password" label="Yangi parol" value={securityData.newPassword} onChange={(e) => setSecurityData({ ...securityData, newPassword: e.target.value })} />
                <Input type="password" label="Yangi parolni tasdiqlang" value={securityData.confirmPassword} onChange={(e) => setSecurityData({ ...securityData, confirmPassword: e.target.value })} />
              </div>
            </>
          )}

          {activeTab === 'notifications' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Bildirishnomalar</h2>
              <div className="space-y-5">
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Yangi lidlar</h3>
                    <p className="text-xs text-zinc-500 mt-1">Yangi lid tushganda emailga xabar yuborish</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Haftalik hisobot</h3>
                    <p className="text-xs text-zinc-500 mt-1">Har dushanba kuni haftalik statistika yuborish</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </>
          )}

          {activeTab === 'landing' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Bosh Sahifa (Landing Page)</h2>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">Asosiy Qism (Hero)</h3>
                  <Input label="Asosiy Sarlavha" value={landingData.heroTitle} onChange={(e) => setLandingData({ ...landingData, heroTitle: e.target.value })} />
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Qisqa Ta'rif (Subtitle)</label>
                    <textarea value={landingData.heroSubtitle} onChange={(e) => setLandingData({ ...landingData, heroSubtitle: e.target.value })} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 mt-6">Statistikalar</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {([
                      ['stat1Value', 'stat1Label', 1], ['stat2Value', 'stat2Label', 2],
                      ['stat3Value', 'stat3Label', 3], ['stat4Value', 'stat4Label', 4],
                    ] as const).map(([valueKey, labelKey, n]) => (
                      <div key={n} className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
                        <Input label={`Qurilma ${n} - Qiymat`} value={landingData[valueKey]} onChange={(e) => setLandingData({ ...landingData, [valueKey]: e.target.value })} />
                        <Input label={`Qurilma ${n} - Matn`} value={landingData[labelKey]} onChange={(e) => setLandingData({ ...landingData, [labelKey]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'leads' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Lid Forma Sozlamalari</h2>
              <p className="text-sm text-zinc-500 mb-6">
                Yangi lid (qiziquvchi) qo'shilganda ism/telefon/kursdan tashqari yana qanday
                qo'shimcha ma'lumot so'ralishini tanlang. Bu barcha lid formalarga
                (CRM, sayt "Aloqa" va target formalar) birdek qo'llanadi.
              </p>
              <div className="space-y-3 max-w-md">
                {[
                  { value: 'none', label: "Qo'shimcha maydon yo'q", desc: "Faqat ism, telefon va kurs so'raladi" },
                  { value: 'age', label: 'Yosh', desc: 'Lid qo\'shishda "Yosh" maydoni ko\'rinadi' },
                  { value: 'grade', label: 'Sinf', desc: 'Lid qo\'shishda "Sinf" maydoni ko\'rinadi (masalan: 5-sinf)' },
                ].map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${leadExtraFieldType === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                  >
                    <input
                      type="radio"
                      name="leadExtraField"
                      value={opt.value}
                      checked={leadExtraFieldType === opt.value}
                      onChange={() => setLeadExtraFieldType(opt.value as any)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{opt.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              {leadFieldSaving && <p className="text-xs text-zinc-400 mt-4">Saqlanmoqda...</p>}

              <div className="mt-10 pt-8 border-t border-zinc-200 dark:border-zinc-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Avtomatik Taqsimlash va SLA</h2>
                <p className="text-sm text-zinc-500 mb-6">
                  Yangi lid tushganda uni menejerlar orasida qanday taqsimlash va javob
                  berish muddatini (SLA) belgilang. Bu sozlama sayt va CRM orqali kelgan
                  barcha lidlarga birdek qo'llanadi.
                </p>

                {!isAdmin && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-500 mb-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Bu sozlamalarni faqat administrator o'zgartira oladi.
                  </p>
                )}

                <div className="space-y-5 max-w-md">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Taqsimlash rejimi</label>
                    <div className="flex gap-3">
                      {[{ value: 'on', label: 'Avtomatik' }, { value: 'off', label: "Qo'lda" }].map(opt => (
                        <button
                          type="button"
                          key={opt.value}
                          disabled={!isAdmin}
                          onClick={() => setLeadSettings({ ...leadSettings, mode: opt.value })}
                          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed ${leadSettings.mode === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1.5">
                      {leadSettings.mode === 'on'
                        ? 'Yangi lid eng kam yuklangan menejerga avtomatik biriktiriladi.'
                        : "Yangi lidlar hech kimga biriktirilmaydi — menejer qo'lda oladi."}
                    </p>
                  </div>

                  {leadSettings.mode === 'on' && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Taqsimlash puli</label>
                      <p className="text-xs text-zinc-400 mb-2">Hech kim tanlanmasa — barcha menejer va admin foydalanuvchilar orasida taqsimlanadi.</p>
                      <div className="space-y-1 max-h-56 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 bg-zinc-50 dark:bg-zinc-950">
                        {assignableManagers.length === 0 && <p className="text-xs text-zinc-400">Menejerlar topilmadi</p>}
                        {assignableManagers.map(m => {
                          const checked = leadSettings.pool.includes(m.id);
                          return (
                            <label key={m.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm ${isAdmin ? 'cursor-pointer hover:bg-white dark:hover:bg-zinc-900' : 'cursor-not-allowed opacity-70'}`}>
                              <input
                                type="checkbox"
                                disabled={!isAdmin}
                                checked={checked}
                                onChange={() => setLeadSettings({
                                  ...leadSettings,
                                  pool: checked ? leadSettings.pool.filter(id => id !== m.id) : [...leadSettings.pool, m.id],
                                })}
                              />
                              <span className="font-medium text-slate-800 dark:text-slate-200">{m.name}</span>
                              <span className="text-xs text-zinc-400">
                                ({m.role === 'SUPER_ADMIN' ? 'Super admin' : m.role === 'ADMIN' ? 'Admin' : 'Menejer'})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Input
                    type="number" min="5"
                    label="SLA — javob berish muddati (daqiqa)"
                    value={leadSettings.slaMinutes}
                    disabled={!isAdmin}
                    onChange={e => setLeadSettings({ ...leadSettings, slaMinutes: Number(e.target.value) })}
                  />
                  <p className="text-xs text-zinc-400 -mt-3">Shu vaqt ichida javobsiz qolgan lid uchun menejerga eslatma yuboriladi.</p>

                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="time"
                      label="Ish vaqti boshlanishi"
                      value={leadSettings.workStart}
                      disabled={!isAdmin}
                      onChange={e => setLeadSettings({ ...leadSettings, workStart: e.target.value })}
                    />
                    <Input
                      type="time"
                      label="Ish vaqti tugashi"
                      value={leadSettings.workEnd}
                      disabled={!isAdmin}
                      onChange={e => setLeadSettings({ ...leadSettings, workEnd: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 -mt-3">SLA eslatmalari faqat shu ish soatlari ichida yuboriladi.</p>
                </div>
                {leadSettingsSaving && <p className="text-xs text-zinc-400 mt-4">Saqlanmoqda...</p>}
              </div>
            </>
          )}

          {activeTab === 'billing' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">To'lov / Davomat Hisob-kitobi</h2>
              <p className="text-sm text-zinc-500 mb-6">
                Har bir o'quvchining oylik to'lovi davomat asosida avtomatik hisoblanadi:
                agar shu oy ichida bir kursdan pastdagi chegaradan ko'p dars qoldirsa,
                qoldirgan kunlari uchun pul avtomatik ayriladi.
              </p>
              <div className="space-y-5 max-w-md">
                <div>
                  <Input
                    type="number" min="1"
                    label="Oyiga nechta dars (standart)"
                    value={billingSettings.lessonsPerMonth}
                    onChange={e => setBillingSettings({ ...billingSettings, lessonsPerMonth: Number(e.target.value) })}
                  />
                  <p className="text-xs text-zinc-400 mt-1">Kurs narxi shu songa bo'linib, bitta dars narxi topiladi.</p>
                </div>
                <div>
                  <Input
                    type="number" min="0"
                    label="Nechta darsdan ko'p qoldirilsa chegirma ishlaydi"
                    value={billingSettings.absenceThreshold}
                    onChange={e => setBillingSettings({ ...billingSettings, absenceThreshold: Number(e.target.value) })}
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Masalan {billingSettings.absenceThreshold} bo'lsa: {billingSettings.absenceThreshold} tagacha qoldirsa to'liq narx,
                    {' '}{billingSettings.absenceThreshold + 1}+ qoldirsa barcha qoldirgan kunlari uchun chegirma.
                  </p>
                </div>
                <div>
                  <Input
                    type="number" min="0" max="100"
                    label="O'qituvchi stavkasi (% tushumdan)"
                    value={billingSettings.teacherSalaryPercent}
                    onChange={e => setBillingSettings({ ...billingSettings, teacherSalaryPercent: Number(e.target.value) })}
                  />
                  <p className="text-xs text-zinc-400 mt-1">O'qituvchi oyligi shu foizda, davomat chegirmasidan keyingi haqiqiy tushumdan hisoblanadi.</p>
                </div>
              </div>
              {billingSaving && <p className="text-xs text-zinc-400 mt-4">Saqlanmoqda...</p>}
            </>
          )}

          {activeTab === 'backup' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Ma'lumotlar Bazasi Backup</h2>
              <div className="space-y-6">
                {systemStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">{systemStats.students}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">O'quvchilar</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">{systemStats.groups}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">Guruhlar</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">{systemStats.leads}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">Lidlar</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">{systemStats.users}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">Foydalanuvchilar</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">{systemStats.payments}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">To'lovlar</p>
                    </div>
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">{systemStats.dbSize}</p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">Baza hajmi</p>
                    </div>
                  </div>
                )}

                <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                      <HardDrive size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-slate-900 dark:text-white">Ma'lumotlar bazasini yuklab olish</h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">To'liq baza nusxasi (.db yoki .sql) yuklab olinadi. Backup faylni xavfsiz joyda saqlang.</p>
                      <Button
                        onClick={async () => {
                          setBackupLoading(true);
                          try {
                            const res = await api.get('/auth/backup', { responseType: 'blob' });
                            const disposition: string = res.headers?.['content-disposition'] || '';
                            const match = disposition.match(/filename="?([^"]+)"?/);
                            const filename = match?.[1] || `tayyorlov-backup-${new Date().toISOString().slice(0, 10)}.db`;
                            const url = window.URL.createObjectURL(new Blob([res.data]));
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            a.click();
                            window.URL.revokeObjectURL(url);
                            showToast("Backup muvaffaqiyatli yuklab olindi!", 'success');
                          } catch {
                            showToast("Backup olishda xatolik yuz berdi", 'error');
                          } finally {
                            setBackupLoading(false);
                          }
                        }}
                        isLoading={backupLoading}
                        leftIcon={<Download size={16} />}
                        className="mt-3"
                      >
                        Backup yuklab olish
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
