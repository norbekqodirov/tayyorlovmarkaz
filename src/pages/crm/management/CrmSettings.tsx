import { useState, useEffect } from 'react';
import { Save, User, Lock, Bell, Globe, Database, Download, HardDrive } from 'lucide-react';
import { useFirestore } from '../../../hooks/useFirestore';
import api from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { PhoneInput } from '../../../components/ui/PhoneInput';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { ErrorState } from '../../../components/States';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

export default function CrmSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { showToast } = useToast();
  const { documents: settingsDocs, loading: settingsLoading, error: settingsErr, refetch: refetchSettings, updateDocument: updateSetting, addDocument: addSetting } = useFirestore<any>('settings');
  const { documents: pageDocs, loading: pageLoading, error: pageErr, refetch: refetchPages, updateDocument: updatePage, addDocument: addPage } = useFirestore<any>('pageContent');
  
  const [systemStats, setSystemStats] = useState<any>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [leadExtraFieldType, setLeadExtraFieldType] = useState<'none' | 'age' | 'grade'>('none');
  const [leadFieldSaving, setLeadFieldSaving] = useState(false);
  const [leadSettings, setLeadSettings] = useState({ mode: 'on', pool: [] as string[], slaMinutes: 30, workStart: '09:00', workEnd: '19:00' });
  const [leadSettingsSaving, setLeadSettingsSaving] = useState(false);
  const [assignableManagers, setAssignableManagers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [billingSettings, setBillingSettings] = useState<{ lessonsPerMonth: number; absenceThreshold: number; teacherSalaryPercent: number; cycleMode: 'calendar' | 'group_anniversary' }>({ lessonsPerMonth: 12, absenceThreshold: 3, teacherSalaryPercent: 40, cycleMode: 'calendar' });
  const [billingSaving, setBillingSaving] = useState(false);

  const userRoleLevel = getCurrentRoleLevel();
  // server/middleware/auth.ts COLLECTION_WRITE_LEVEL.settings = 4 (SUPER_ADMIN only)
  const isSuperAdmin = userRoleLevel >= ROLE_LEVEL.SUPER_ADMIN;
  const isAdmin = userRoleLevel >= ROLE_LEVEL.ADMIN;

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

  const loadAllData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [meRes, configRes, leadSetRes, managersRes, billingRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/public/lead-form-config').catch(() => ({ data: { type: 'none' } })),
        api.get('/leads/settings').catch(() => ({ data: { mode: 'on', pool: [], slaMinutes: 30, workStart: '09:00', workEnd: '19:00' } })),
        api.get('/leads/assignable-users').catch(() => ({ data: [] })),
        api.get('/finance/billing-settings').catch(() => ({ data: { lessonsPerMonth: 12, absenceThreshold: 3, teacherSalaryPercent: 40, cycleMode: 'calendar' } }))
      ]);

      const user = meRes.data;
      setCurrentUser(user);
      setProfileData({
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
      });

      if (configRes.data?.type) setLeadExtraFieldType(configRes.data.type);
      if (leadSetRes.data) setLeadSettings(leadSetRes.data);
      if (managersRes.data) setAssignableManagers(managersRes.data);
      if (billingRes.data) setBillingSettings(billingRes.data);
    } catch (err: any) {
      setFetchError(err?.response?.data?.message || err?.message || 'Sozlamalarni yuklashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
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

  const handleSave = async () => {
    try {
      if (activeTab === 'profile') {
        if (!profileData.name || !profileData.name.trim()) {
          showToast("To'liq ism kiritilishi shart!", 'error');
          return;
        }
        if (currentUser?.id) {
          await api.put(`/auth/users/${currentUser.id}`, {
            name: profileData.name.trim(),
            phone: profileData.phone,
            email: profileData.email,
          });
          const stored = JSON.parse(localStorage.getItem('crm_user') || '{}');
          localStorage.setItem('crm_user', JSON.stringify({ ...stored, name: profileData.name.trim(), phone: profileData.phone, email: profileData.email }));
        }
        showToast("Profil ma'lumotlari saqlandi!", 'success');
      } else if (activeTab === 'site') {
        if (!isSuperAdmin) {
          showToast("Sayt sozlamalarini saqlash uchun Super Admin (daraja 4) huquqi talab qilinadi!", 'error');
          return;
        }
        if (!siteData.siteName || !siteData.siteName.trim()) {
          showToast("Sayt nomi kiritilishi shart!", 'error');
          return;
        }
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
          const res = await api.put('/auth/change-password', {
            currentPassword: securityData.currentPassword,
            newPassword: securityData.newPassword
          });
          // IP-26: eski sessiyalar (boshqa qurilmalar) yaroqsiz — shu qurilma uchun yangi token
          if (res.data?.token) { try { localStorage.setItem('crm_token', res.data.token); } catch { /* keyingi kirishda */ } }
          showToast("Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar bekor qilindi.", 'success');
          setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
          showToast(err.response?.data?.message || "Parolni o'zgartirishda xatolik yuz berdi!", 'error');
          return;
        }
      } else if (activeTab === 'landing') {
        if (!isAdmin) {
          showToast("Bosh sahifa sozlamalarini saqlash uchun Administrator huquqi talab qilinadi!", 'error');
          return;
        }
        const landingExists = pageDocs.some(doc => doc.id === 'home');
        if (landingExists) {
          await updatePage('home', landingData);
        } else {
          await addPage({ id: 'home', ...landingData });
        }
        showToast("Bosh sahifa ma'lumotlari saqlandi!", 'success');
      } else if (activeTab === 'leads') {
        if (!isAdmin) {
          showToast("Lid sozlamalarini saqlash uchun Administrator huquqi talab qilinadi!", 'error');
          return;
        }
        if (leadSettings.slaMinutes === undefined || leadSettings.slaMinutes === null || isNaN(Number(leadSettings.slaMinutes)) || Number(leadSettings.slaMinutes) < 5) {
          showToast("SLA vaqti kamida 5 daqiqa bo'lishi kerak!", 'error');
          return;
        }
        setLeadFieldSaving(true);
        try {
          await api.put('/public/lead-form-config', { type: leadExtraFieldType });
          setLeadSettingsSaving(true);
          try {
            await api.put('/leads/settings', { ...leadSettings, slaMinutes: Number(leadSettings.slaMinutes) });
          } finally {
            setLeadSettingsSaving(false);
          }
          showToast("Lid sozlamalari saqlandi!", 'success');
        } finally {
          setLeadFieldSaving(false);
        }
      } else if (activeTab === 'billing') {
        if (!isAdmin) {
          showToast("To'lov sozlamalarini saqlash uchun Administrator huquqi talab qilinadi!", 'error');
          return;
        }
        if (!billingSettings.lessonsPerMonth || isNaN(Number(billingSettings.lessonsPerMonth)) || Number(billingSettings.lessonsPerMonth) < 1) {
          showToast("Oyiga darslar soni kamida 1 ta bo'lishi kerak!", 'error');
          return;
        }
        if (billingSettings.absenceThreshold === undefined || billingSettings.absenceThreshold === null || isNaN(Number(billingSettings.absenceThreshold)) || Number(billingSettings.absenceThreshold) < 0) {
          showToast("Davomat chegarasi manfiy bo'lishi mumkin emas!", 'error');
          return;
        }
        if (billingSettings.teacherSalaryPercent === undefined || billingSettings.teacherSalaryPercent === null || isNaN(Number(billingSettings.teacherSalaryPercent)) || Number(billingSettings.teacherSalaryPercent) < 0 || Number(billingSettings.teacherSalaryPercent) > 100) {
          showToast("O'qituvchi stavkasi 0 va 100 foiz oralig'ida bo'lishi kerak!", 'error');
          return;
        }
        setBillingSaving(true);
        try {
          const payload = {
            lessonsPerMonth: Number(billingSettings.lessonsPerMonth),
            absenceThreshold: Number(billingSettings.absenceThreshold),
            teacherSalaryPercent: Number(billingSettings.teacherSalaryPercent),
            cycleMode: billingSettings.cycleMode,
          };
          const res = await api.put('/finance/billing-settings', payload);
          setBillingSettings(res.data);
          showToast("To'lov hisob-kitobi sozlamalari saqlandi!", 'success');
        } finally {
          setBillingSaving(false);
        }
      }
    } catch (error: any) {
      console.error("Error saving settings:", error);
      showToast(error.response?.data?.message || error.message || "Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.", 'error');
    }
  };
  const combinedError = fetchError || settingsErr?.message || pageErr?.message;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Sozlamalar</h1>
        <Button onClick={handleSave} leftIcon={<Save size={18} />}>
          Saqlash
        </Button>
      </div>

      {combinedError ? (
        <ErrorState
          message={combinedError}
          onRetry={() => {
            loadAllData();
            refetchSettings();
            refetchPages();
          }}
        />
      ) : loading || settingsLoading || pageLoading ? (
        <div className="py-12 text-center text-zinc-400 font-medium">
          Yuklanmoqda...
        </div>
      ) : (
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
            {!isSuperAdmin && activeTab === 'site' && (
              <div className="p-3 mb-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-400">
                ⚠️ Sayt ma'lumotlarini saqlash va o'zgartirish faqat Super Admin uchun ruxsat etilgan.
              </div>
            )}

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
                  <Input label="Sayt nomi" value={siteData.siteName} onChange={(e) => setSiteData({ ...siteData, siteName: e.target.value })} disabled={!isSuperAdmin} />
                  <PhoneInput label="Aloqa telefoni" value={siteData.contactPhone} onChange={(contactPhone) => setSiteData({ ...siteData, contactPhone })} />
                  <Input label="Manzil" value={siteData.address} onChange={(e) => setSiteData({ ...siteData, address: e.target.value })} disabled={!isSuperAdmin} />
                  <Input type="url" label="Instagram URL" value={siteData.instagram} onChange={(e) => setSiteData({ ...siteData, instagram: e.target.value })} disabled={!isSuperAdmin} />
                  <Input type="url" label="Telegram URL" value={siteData.telegram} onChange={(e) => setSiteData({ ...siteData, telegram: e.target.value })} disabled={!isSuperAdmin} />
                </div>
              </>
            )}

            {activeTab === 'security' && (
              <>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Xavfsizlik</h2>
                <div className="space-y-5">
                  <Input type="password" autoComplete="current-password" label="Joriy parol" value={securityData.currentPassword} onChange={(e) => setSecurityData({ ...securityData, currentPassword: e.target.value })} />
                  <Input type="password" autoComplete="new-password" label="Yangi parol" value={securityData.newPassword} onChange={(e) => setSecurityData({ ...securityData, newPassword: e.target.value })} />
                  <Input type="password" autoComplete="new-password" label="Yangi parolni tasdiqlang" value={securityData.confirmPassword} onChange={(e) => setSecurityData({ ...securityData, confirmPassword: e.target.value })} />
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
                    <Input label="Asosiy Sarlavha" value={landingData.heroTitle} onChange={(e) => setLandingData({ ...landingData, heroTitle: e.target.value })} disabled={!isAdmin} />
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Qisqa Ta'rif (Subtitle)</label>
                      <textarea disabled={!isAdmin} value={landingData.heroSubtitle} onChange={(e) => setLandingData({ ...landingData, heroSubtitle: e.target.value })} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px] disabled:opacity-60" />
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
                          <Input disabled={!isAdmin} label={`Qurilma ${n} - Qiymat`} value={landingData[valueKey]} onChange={(e) => setLandingData({ ...landingData, [valueKey]: e.target.value })} />
                          <Input disabled={!isAdmin} label={`Qurilma ${n} - Matn`} value={landingData[labelKey]} onChange={(e) => setLandingData({ ...landingData, [labelKey]: e.target.value })} />
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
                  qo'shimcha ma'lumot so'ralishini tanlang. Bu CRM va sayt "Aloqa" sahifasiga
                  to'g'ridan-to'g'ri qo'llanadi; har bir target forma esa (Marketing → Target
                  Formalar) buni o'zi uchun alohida ustidan yozishi mumkin — o'sha yerda
                  belgilanmagan formalar shu standart qiymatni meros oladi.
                </p>
                <div className="space-y-3 max-w-md">
                  {[
                    { value: 'none', label: "Qo'shimcha maydon yo'q", desc: "Faqat ism, telefon va kurs so'raladi" },
                    { value: 'age', label: 'Yosh', desc: 'Lid qo\'shishda "Yosh" maydoni ko\'rinadi' },
                    { value: 'grade', label: 'Sinf', desc: 'Lid qo\'shishda "Sinf" maydoni ko\'rinadi (masalan: 5-sinf)' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${leadExtraFieldType === opt.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}
                    >
                      <input
                        type="radio"
                        name="leadExtraField"
                        disabled={!isAdmin}
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
                    <p className="text-xs text-zinc-400 -mt-3">Shu vaqt ichida javobsiz qolgan lid uchun menejerga eslatma yuboriladi (kamida 5 daqiqa).</p>

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
                  agar shu oy ichida bir kursdan pastdagi chegaradagi songa yetadigan yoki undan
                  ko'p dars qoldirsa, qoldirgan barcha kunlari uchun pul avtomatik ayriladi.
                </p>
                <div className="space-y-5 max-w-xl">
                  <fieldset className="space-y-2" disabled={!isAdmin}>
                    <legend className="text-sm font-bold text-slate-700 dark:text-zinc-300 mb-1">Bir oy qanday hisoblanadi</legend>
                    {([
                      { value: 'calendar', title: 'Kalendar oy bo\'yicha (standart)', text: "15-sentabrda boshlangan guruh: 15–30-sentabr o'tilgan darslar bo'yicha, oktabrdan boshlab har oy to'liq to'lov." },
                      { value: 'group_anniversary', title: 'Guruh boshlangan kundan har oy', text: "15-sentabrda boshlangan guruh: birinchi oy 15-sentabr – 14-oktabr, keyingisi 15-oktabr – 14-noyabr va hokazo; har oy to'liq to'lov." },
                    ] as const).map(o => (
                      <label key={o.value} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${billingSettings.cycleMode === o.value ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10' : 'border-zinc-200 dark:border-zinc-700'}`}>
                        <input type="radio" name="cycleMode" value={o.value} checked={billingSettings.cycleMode === o.value}
                          onChange={() => setBillingSettings({ ...billingSettings, cycleMode: o.value })} className="mt-1 accent-blue-600" />
                        <span>
                          <span className="block text-sm font-bold text-slate-900 dark:text-white">{o.title}</span>
                          <span className="block text-xs text-zinc-500 mt-0.5">{o.text}</span>
                        </span>
                      </label>
                    ))}
                    <p className="text-xs text-zinc-400">O'quvchi oy o'rtasida qo'shilsa — shu oyning qolgan darslari bo'yicha. Usul hali hisob chiqmagan guruhlarga qo'llanadi; hisobi chiqqan guruh o'z usulida davom etadi (oylar orasida bo'shliq yoki ikki marta hisob bo'lmasligi uchun).</p>
                  </fieldset>
                  <div>
                    <Input
                      type="number" min="1"
                      label="Oyiga nechta dars (standart)"
                      disabled={!isAdmin}
                      value={billingSettings.lessonsPerMonth}
                      onChange={e => setBillingSettings({ ...billingSettings, lessonsPerMonth: Number(e.target.value) })}
                    />
                    <p className="text-xs text-zinc-400 mt-1">Kurs narxi shu songa bo'linib, bitta dars narxi topiladi (kamida 1).</p>
                  </div>
                  <div>
                    <Input
                      type="number" min="0"
                      label="Chegirma boshlanadigan eng kam qoldirilgan dars soni"
                      disabled={!isAdmin}
                      value={billingSettings.absenceThreshold}
                      onChange={e => setBillingSettings({ ...billingSettings, absenceThreshold: Number(e.target.value) })}
                    />
                    <p className="text-xs text-zinc-400 mt-1">
                      Masalan {billingSettings.absenceThreshold} bo'lsa: {Math.max(0, billingSettings.absenceThreshold - 1)} tagacha qoldirsa to'liq narx,
                      {' '}{billingSettings.absenceThreshold}+ qoldirsa BARCHA qoldirilgan darslar (aynan {billingSettings.absenceThreshold} tasi ham) uchun chegirma.
                    </p>
                  </div>
                  <div>
                    <Input
                      type="number" min="0" max="100"
                      label="O'qituvchi stavkasi (% tushumdan)"
                      disabled={!isAdmin}
                      value={billingSettings.teacherSalaryPercent}
                      onChange={e => setBillingSettings({ ...billingSettings, teacherSalaryPercent: Number(e.target.value) })}
                    />
                    <p className="text-xs text-zinc-400 mt-1">O'qituvchi oyligi shu foizda (0% - 100%), davomat chegirmasidan keyingi haqiqiy tushumdan hisoblanadi.</p>
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
                            } catch (err: any) {
                              showToast(err?.response?.data?.message || "Backup olishda xatolik yuz berdi", 'error');
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
      )}
    </div>
  );
}
