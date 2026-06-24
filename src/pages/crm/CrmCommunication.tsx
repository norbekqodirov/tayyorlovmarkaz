import { useState, useEffect, useCallback } from 'react';
import {
  Bell, MessageSquare, Send, Plus, Trash2, Edit2, Users,
  AlertTriangle, CheckCircle2, Clock, ChevronDown, Copy, X,
  Megaphone, FileText, Settings, BellRing
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/Toast';
import api from '../../api/client';

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  type: string;
  language: string;
  createdAt: string;
}

interface BulkMessage {
  id: string;
  content: string;
  targetType: string;
  targetId: string | null;
  sentAt: string | null;
  sentCount: number;
  status: string;
  createdAt: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const TEMPLATE_TYPES = [
  { value: 'PAYMENT_REMINDER', label: "To'lov eslatmasi" },
  { value: 'LESSON_REMINDER', label: 'Dars eslatmasi' },
  { value: 'WELCOME', label: 'Xush kelibsiz' },
  { value: 'BIRTHDAY', label: 'Tug\'ilgan kun' },
  { value: 'ANNOUNCEMENT', label: "E'lon" },
  { value: 'RESULT', label: 'Natijalar' },
  { value: 'CUSTOM', label: 'Maxsus' },
];

const TEMPLATE_VARS = ['{{student_name}}', '{{group_name}}', '{{amount}}', '{{due_date}}', '{{lesson_time}}', '{{teacher_name}}'];

const TARGET_TYPES = [
  { value: 'all', label: 'Barcha talabalar' },
  { value: 'debtors', label: 'Qarzdorlar' },
  { value: 'group', label: 'Guruh bo\'yicha' },
  { value: 'course', label: 'Kurs bo\'yicha' },
  { value: 'leads', label: 'Faol Lidlar' },
];

function typeColor(type: string) {
  const map: Record<string, string> = {
    PAYMENT_REMINDER: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    LESSON_REMINDER: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    WELCOME: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
    BIRTHDAY: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400',
    ANNOUNCEMENT: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
    RESULT: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',
    CUSTOM: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };
  return map[type] || map.CUSTOM;
}

export default function CrmCommunication() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'templates' | 'bulk' | 'notifications'>('templates');

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', content: '', type: 'CUSTOM', language: 'uz' });

  // Bulk messages
  const [bulkMessages, setBulkMessages] = useState<BulkMessage[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ content: '', targetType: 'all', targetId: '', templateId: '' });
  const [bulkSending, setBulkSending] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get('/communication/templates');
      setTemplates(res.data || []);
    } catch { setTemplates([]); } finally { setTemplatesLoading(false); }
  }, []);

  const fetchBulkMessages = useCallback(async () => {
    try {
      const res = await api.get('/communication/bulk-messages');
      setBulkMessages(res.data || []);
    } catch { setBulkMessages([]); }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data || []);
    } catch { setNotifications([]); } finally { setNotifLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'templates') fetchTemplates();
    if (activeTab === 'bulk') { fetchBulkMessages(); fetchTemplates(); }
    if (activeTab === 'notifications') fetchNotifications();
  }, [activeTab]);

  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.content) return;
    try {
      if (editingTemplate) {
        await api.put(`/communication/templates/${editingTemplate.id}`, templateForm);
        showToast("Shablon yangilandi", 'success');
      } else {
        await api.post('/communication/templates', templateForm);
        showToast("Shablon yaratildi", 'success');
      }
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      setTemplateForm({ name: '', content: '', type: 'CUSTOM', language: 'uz' });
      fetchTemplates();
    } catch { showToast("Xatolik yuz berdi", 'error'); }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.delete(`/communication/templates/${id}`);
      showToast("Shablon o'chirildi", 'success');
      fetchTemplates();
    } catch { showToast("Xatolik yuz berdi", 'error'); }
  };

  const handleSendBulk = async () => {
    if (!bulkForm.content) return;
    setBulkSending(true);
    try {
      await api.post('/communication/bulk-messages/send', bulkForm);
      showToast("Xabar muvaffaqiyatli yuborildi", 'success');
      setIsBulkModalOpen(false);
      setBulkForm({ content: '', targetType: 'all', targetId: '', templateId: '' });
      fetchBulkMessages();
    } catch { showToast("Xabar yuborishda xatolik", 'error'); } finally { setBulkSending(false); }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read', {});
      setNotifications(n => n.map(x => ({ ...x, isRead: true })));
      showToast("Barcha bildirishnomalar o'qilgan deb belgilandi", 'success');
    } catch { /* ignore */ }
  };

  const insertVar = (varStr: string) => {
    setTemplateForm(f => ({ ...f, content: f.content + varStr }));
  };

  const applyTemplate = (tmpl: MessageTemplate) => {
    setBulkForm(f => ({ ...f, content: tmpl.content, templateId: tmpl.id }));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Aloqa Markazi</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Xabar shablonlari, ommaviy yuborish va bildirishnomalar</p>
        </div>
        {activeTab === 'templates' && (
          <Button onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', content: '', type: 'CUSTOM', language: 'uz' }); setIsTemplateModalOpen(true); }} leftIcon={<Plus size={16} />}>
            Yangi Shablon
          </Button>
        )}
        {activeTab === 'bulk' && (
          <Button onClick={() => setIsBulkModalOpen(true)} leftIcon={<Send size={16} />}>
            Xabar Yuborish
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Shablonlar', value: templates.length, icon: FileText, color: 'from-blue-600 to-indigo-700' },
          { label: 'Yuborilgan xabarlar', value: bulkMessages.filter(m => m.status === 'sent').length, icon: Send, color: 'from-emerald-500 to-teal-600' },
          { label: "O'qilmagan", value: unreadCount, icon: BellRing, color: 'from-amber-500 to-orange-600' },
        ].map((stat, i) => (
          <div key={i} className={`bg-gradient-to-br ${stat.color} rounded-2xl p-4 text-white shadow-lg`}>
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center mb-2">
              <stat.icon size={16} />
            </div>
            <p className="text-[9px] font-black text-white/60 uppercase tracking-widest">{stat.label}</p>
            <p className="text-2xl font-black text-white mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit border border-zinc-200 dark:border-zinc-700">
        {[
          { key: 'templates', label: 'Shablonlar', icon: FileText },
          { key: 'bulk', label: 'Ommaviy Yuborish', icon: Megaphone },
          { key: 'notifications', label: `Bildirishnomalar${unreadCount > 0 ? ` (${unreadCount})` : ''}`, icon: Bell },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
              activeTab === tab.key ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-900 dark:text-white' : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <tab.icon size={12} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ── SHABLONLAR ─────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          {templatesLoading ? (
            <div className="py-16 text-center text-zinc-400">Yuklanmoqda...</div>
          ) : templates.length === 0 ? (
            <div className="py-16 text-center">
              <FileText size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">Shablonlar mavjud emas</p>
              <button onClick={() => setIsTemplateModalOpen(true)} className="mt-3 text-xs text-blue-500 font-bold hover:underline">
                + Birinchi shablonni yaratish
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="p-4 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-black text-slate-900 dark:text-white">{tmpl.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${typeColor(tmpl.type)}`}>
                          {TEMPLATE_TYPES.find(t => t.value === tmpl.type)?.label || tmpl.type}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          {tmpl.language === 'uz' ? "O'zbek" : 'Rus'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{tmpl.content}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={() => { navigator.clipboard.writeText(tmpl.content); showToast("Nusxalandi", 'success'); }}
                        className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => { setEditingTemplate(tmpl); setTemplateForm({ name: tmpl.name, content: tmpl.content, type: tmpl.type, language: tmpl.language }); setIsTemplateModalOpen(true); }}
                        className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg text-blue-500"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg text-rose-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── OMMAVIY YUBORISH ──────────────────────────────────── */}
      {activeTab === 'bulk' && (
        <div className="space-y-4">
          {bulkMessages.length === 0 ? (
            <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm py-16 text-center">
              <Send size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">Hali xabar yuborilmagan</p>
              <button onClick={() => setIsBulkModalOpen(true)} className="mt-3 text-xs text-blue-500 font-bold hover:underline">
                + Birinchi xabarni yuborish
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {bulkMessages.map(msg => (
                  <div key={msg.id} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          msg.status === 'sent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                          : msg.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>
                          {msg.status === 'sent' ? 'Yuborildi' : msg.status === 'failed' ? 'Xatolik' : 'Qoralama'}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {TARGET_TYPES.find(t => t.value === msg.targetType)?.label || msg.targetType}
                          {msg.sentCount > 0 && ` • ${msg.sentCount} ta`}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400">{msg.sentAt ? new Date(msg.sentAt).toLocaleDateString('uz-UZ') : new Date(msg.createdAt).toLocaleDateString('uz-UZ')}</span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BILDIRISHNOMALAR ───────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div className="bg-white dark:bg-[#111118] rounded-2xl border border-zinc-200 dark:border-white/[0.05] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <p className="text-sm font-black text-slate-900 dark:text-white">Barcha Bildirishnomalar</p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-blue-500 font-bold hover:underline">
                Barchasini o'qilgan deb belgilash
              </button>
            )}
          </div>
          {notifLoading ? (
            <div className="py-12 text-center text-zinc-400">Yuklanmoqda...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Bell size={32} className="mx-auto text-zinc-200 mb-2" />
              <p className="text-sm font-bold text-zinc-400">Bildirishnomalar yo'q</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {notifications.map(n => (
                <div key={n.id} className={`p-4 transition-colors ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-500/5' : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      n.type === 'alert' ? 'bg-rose-100 dark:bg-rose-500/20' :
                      n.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-500/20' :
                      n.type === 'warning' ? 'bg-amber-100 dark:bg-amber-500/20' :
                      'bg-blue-100 dark:bg-blue-500/20'
                    }`}>
                      {n.type === 'alert' ? <AlertTriangle size={13} className="text-rose-500" /> :
                       n.type === 'success' ? <CheckCircle2 size={13} className="text-emerald-500" /> :
                       n.type === 'warning' ? <AlertTriangle size={13} className="text-amber-500" /> :
                       <Bell size={13} className="text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-bold ${!n.isRead ? 'text-slate-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'}`}>{n.title}</p>
                        <span className="text-[10px] text-zinc-400 shrink-0">{new Date(n.createdAt).toLocaleDateString('uz-UZ')}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{n.message}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SHABLON MODALI ─────────────────────────────────────── */}
      <Modal isOpen={isTemplateModalOpen} onClose={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); }}
        title={editingTemplate ? 'Shablonni Tahrirlash' : 'Yangi Shablon Yaratish'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Shablon nomi</label>
            <input
              placeholder="Masalan: Oylik to'lov eslatmasi"
              value={templateForm.name}
              onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Tur</label>
              <select
                value={templateForm.type}
                onChange={e => setTemplateForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Til</label>
              <select
                value={templateForm.language}
                onChange={e => setTemplateForm(f => ({ ...f, language: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
              >
                <option value="uz">O'zbek</option>
                <option value="ru">Rus</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Matn</label>
            <textarea
              rows={5}
              placeholder="Xabar matnini kiriting..."
              value={templateForm.content}
              onChange={e => setTemplateForm(f => ({ ...f, content: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
            />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">O'zgaruvchilar</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map(v => (
                <button key={v} onClick={() => insertVar(v)}
                  className="px-2 py-1 text-[10px] font-black bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 transition-colors">
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); }} className="flex-1">Bekor</Button>
            <Button onClick={handleSaveTemplate} className="flex-1" disabled={!templateForm.name || !templateForm.content}>
              {editingTemplate ? 'Saqlash' : 'Yaratish'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── OMMAVIY XABAR MODALI ───────────────────────────────── */}
      <Modal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} title="Ommaviy Xabar Yuborish">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Qabul qiluvchilar</label>
            <select
              value={bulkForm.targetType}
              onChange={e => setBulkForm(f => ({ ...f, targetType: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              {TARGET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Shablon tanlash (ixtiyoriy)</label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {templates.map(tmpl => (
                  <button key={tmpl.id} onClick={() => applyTemplate(tmpl)}
                    className={`p-2 text-left rounded-xl border text-xs transition-all ${
                      bulkForm.templateId === tmpl.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 text-zinc-600 dark:text-zinc-400'
                    }`}>
                    <p className="font-black truncate">{tmpl.name}</p>
                    <p className="text-[10px] truncate opacity-70">{TEMPLATE_TYPES.find(t => t.value === tmpl.type)?.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-1.5">Xabar matni</label>
            <textarea
              rows={5}
              placeholder="Yuborilajak xabar matni..."
              value={bulkForm.content}
              onChange={e => setBulkForm(f => ({ ...f, content: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
            />
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-500/30">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Telegram Bot ulanganida xabar avtomatik yuboriladi
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsBulkModalOpen(false)} className="flex-1">Bekor</Button>
            <Button onClick={handleSendBulk} className="flex-1" disabled={!bulkForm.content || bulkSending} leftIcon={<Send size={14} />}>
              {bulkSending ? 'Yuborilmoqda...' : 'Yuborish'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
