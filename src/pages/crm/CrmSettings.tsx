import React, { useState, useEffect } from 'react';
import { Save, User, Lock, Bell, Globe } from 'lucide-react';
import { useFirestore } from '../../hooks/useFirestore';

export default function CrmSettings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { documents: settingsDocs, updateDocument: updateSetting, addDocument: addSetting } = useFirestore<any>('settings');

  const [profileData, setProfileData] = useState({
    firstName: 'Admin',
    lastName: 'Adminov',
    email: 'admin@tayyorlov.uz',
    phone: '+998 90 123 45 67'
  });

  const [siteData, setSiteData] = useState({
    siteName: 'Tayyorlov Markazi',
    contactPhone: '+998 90 123 45 67',
    address: 'Toshkent shahar, Chilonzor tumani',
    instagram: 'https://instagram.com/tayyorlov',
    telegram: 'https://t.me/tayyorlov'
  });

  useEffect(() => {
    if (settingsDocs.length > 0) {
      const profileInfo = settingsDocs.find((doc) => doc.id === 'profile');
      if (profileInfo) {
        setProfileData(profileInfo);
      }
      const siteInfo = settingsDocs.find((doc) => doc.id === 'site');
      if (siteInfo) {
        setSiteData(siteInfo);
      }
    }
  }, [settingsDocs]);

  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleSave = async () => {
    try {
      if (activeTab === 'profile') {
        const profileExists = settingsDocs.some(doc => doc.id === 'profile');
        if (profileExists) {
          await updateSetting('profile', profileData);
        } else {
          await addSetting({ id: 'profile', ...profileData });
        }
        alert("Profil ma'lumotlari saqlandi!");
      } else if (activeTab === 'site') {
        const siteExists = settingsDocs.some(doc => doc.id === 'site');
        if (siteExists) {
          await updateSetting('site', siteData);
        } else {
          await addSetting({ id: 'site', ...siteData });
        }
        alert("Sayt ma'lumotlari saqlandi!");
      } else if (activeTab === 'security') {
        if (securityData.newPassword !== securityData.confirmPassword) {
          alert("Yangi parollar mos tushmadi!");
          return;
        }
        if (securityData.newPassword.length < 6) {
          alert("Parol kamida 6 ta belgidan iborat bo'lishi kerak!");
          return;
        }
        alert("Parol muvaffaqiyatli o'zgartirildi!");
        setSecurityData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    }
  };
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Sozlamalar</h1>
        <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm">
          <Save size={18} />
          Saqlash
        </button>
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
        </div>

        {/* Settings Content */}
        <div className="col-span-1 md:col-span-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          {activeTab === 'profile' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Profil ma'lumotlari</h2>
              
              <div className="space-y-5">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-2xl font-black border-2 border-dashed border-zinc-300 dark:border-zinc-700">
                    {profileData.firstName.charAt(0)}
                  </div>
                  <div>
                    <button className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-900 dark:text-white text-sm font-bold rounded-lg transition-colors">
                      Rasm yuklash
                    </button>
                    <p className="text-xs text-zinc-500 mt-2">Tavsiya etilgan o'lcham: 400x400px</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Ism</label>
                    <input type="text" value={profileData.firstName} onChange={(e) => setProfileData({...profileData, firstName: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Familiya</label>
                    <input type="text" value={profileData.lastName} onChange={(e) => setProfileData({...profileData, lastName: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Email</label>
                  <input type="email" value={profileData.email} onChange={(e) => setProfileData({...profileData, email: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Telefon raqam</label>
                  <input type="tel" value={profileData.phone} onChange={(e) => setProfileData({...profileData, phone: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
              </div>
            </>
          )}

          {activeTab === 'site' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Sayt ma'lumotlari</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Sayt nomi</label>
                  <input type="text" value={siteData.siteName} onChange={(e) => setSiteData({...siteData, siteName: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Aloqa telefoni</label>
                  <input type="tel" value={siteData.contactPhone} onChange={(e) => setSiteData({...siteData, contactPhone: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Manzil</label>
                  <input type="text" value={siteData.address} onChange={(e) => setSiteData({...siteData, address: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Instagram URL</label>
                  <input type="url" value={siteData.instagram} onChange={(e) => setSiteData({...siteData, instagram: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Telegram URL</label>
                  <input type="url" value={siteData.telegram} onChange={(e) => setSiteData({...siteData, telegram: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
              </div>
            </>
          )}

          {activeTab === 'security' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Xavfsizlik</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Joriy parol</label>
                  <input type="password" value={securityData.currentPassword} onChange={(e) => setSecurityData({...securityData, currentPassword: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Yangi parol</label>
                  <input type="password" value={securityData.newPassword} onChange={(e) => setSecurityData({...securityData, newPassword: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Yangi parolni tasdiqlang</label>
                  <input type="password" value={securityData.confirmPassword} onChange={(e) => setSecurityData({...securityData, confirmPassword: e.target.value})} className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
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
        </div>
      </div>
    </div>
  );
}
