import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Send, Link2, Users, Settings, CheckCircle, AlertCircle,
  MessageSquare, Bot, Copy, ExternalLink, Loader2, Zap,
  Phone, Search
} from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../components/Toast';

interface Student {
  id: string;
  name: string;
  phone: string;
  notes?: string;
}

interface BotInfo {
  ok: boolean;
  result?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_message?: string;
    last_error_date?: number;
  };
}

export default function CrmTelegram() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'link' | 'broadcast' | 'setup'>('overview');
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [botInfoLoading, setBotInfoLoading] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [linkChatId, setLinkChatId] = useState('');
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastTarget, setBroadcastTarget] = useState('all');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);

  const fetchBotInfo = useCallback(async () => {
    setBotInfoLoading(true);
    try {
      const res = await api.get<BotInfo>('/telegram/info');
      setBotInfo(res.data);
    } catch {
      setBotInfo(null);
    } finally {
      setBotInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBotInfo();
    api.get<Student[]>('/students').then(r => setStudents(Array.isArray(r.data) ? r.data : (r.data as any).data ?? [])).catch(() => {});
  }, [fetchBotInfo]);

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (s.phone || '').includes(studentSearch)
  );

  const linkedCount = students.filter(s => s.notes?.includes('tg:')).length;

  const handleLinkStudent = async () => {
    if (!linkStudentId || !linkChatId) {
      showToast("O'quvchi va Chat ID ni tanlang", 'error');
      return;
    }
    setLinkLoading(true);
    try {
      await api.post('/telegram/link-student', { studentId: linkStudentId, telegramChatId: linkChatId });
      showToast("O'quvchi Telegram ga muvaffaqiyatli ulandi!", 'success');
      setLinkChatId('');
      setLinkStudentId('');
      const r = await api.get<Student[]>('/students');
      setStudents(Array.isArray(r.data) ? r.data : (r.data as any).data ?? []);
    } catch (e: any) {
      showToast(e.response?.data?.error || e.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) {
      showToast('Xabar matnini kiriting', 'error');
      return;
    }
    setBroadcastLoading(true);
    try {
      const r = await api.post<{ sent: number; total: number }>('/telegram/broadcast', {
        message: broadcastMsg,
        targetType: broadcastTarget
      });
      showToast(`${r.data.sent} / ${r.data.total} o'quvchiga xabar yuborildi`, 'success');
      setBroadcastMsg('');
    } catch (e: any) {
      showToast(e.response?.data?.error || e.message || 'Yuborishda xatolik', 'error');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleSetWebhook = async () => {
    if (!webhookUrl.trim()) {
      showToast('Webhook URL kiriting', 'error');
      return;
    }
    setWebhookLoading(true);
    try {
      await api.get(`/telegram/set-webhook?url=${encodeURIComponent(webhookUrl)}`);
      showToast('Webhook muvaffaqiyatli sozlandi!', 'success');
      fetchBotInfo();
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Webhook sozlashda xatolik', 'error');
    } finally {
      setWebhookLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Umumiy', icon: Bot },
    { id: 'link', label: 'Ulash', icon: Link2 },
    { id: 'broadcast', label: 'Xabar Yuborish', icon: Send },
    { id: 'setup', label: 'Sozlamalar', icon: Settings },
  ] as const;

  const isConnected = botInfo?.result?.url && botInfo.result.url.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-500/10">
          <Bot className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Telegram Bot</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Bot boshqaruvi va xabar yuborish</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {botInfoLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : isConnected ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-3 py-1.5 rounded-full">
              <CheckCircle className="w-3.5 h-3.5" /> Ulangan
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-1.5 rounded-full">
              <AlertCircle className="w-3.5 h-3.5" /> Ulanmagan
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Jami o'quvchilar", value: students.length, icon: Users, color: 'blue' },
          { label: 'Telegram ulangan', value: linkedCount, icon: Link2, color: 'emerald' },
          { label: 'Pending updates', value: botInfo?.result?.pending_update_count ?? '—', icon: Zap, color: 'amber' },
          { label: 'Webhook holati', value: isConnected ? 'Faol' : 'Nofaol', icon: Bot, color: isConnected ? 'emerald' : 'red' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-zinc-900 rounded-xl p-4 border border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold text-${stat.color}-600 dark:text-${stat.color}-400`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Bot haqida</h3>
              {botInfo?.result ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-36">Webhook URL:</span>
                    <span className="font-mono text-xs bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded break-all flex-1">
                      {botInfo.result.url || 'Sozlanmagan'}
                    </span>
                    {botInfo.result.url && (
                      <button onClick={() => navigator.clipboard.writeText(botInfo.result!.url)}
                        className="p-1 hover:text-blue-500">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-36">Pending updates:</span>
                    <span className="font-medium">{botInfo.result.pending_update_count}</span>
                  </div>
                  {botInfo.result.last_error_message && (
                    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{botInfo.result.last_error_message}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">Bot ma'lumotlarini yuklab bo'lmadi. TELEGRAM_BOT_TOKEN sozlangan ekanligini tekshiring.</p>
              )}
              <button onClick={fetchBotInfo}
                className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                <Loader2 className={`w-3.5 h-3.5 ${botInfoLoading ? 'animate-spin' : ''}`} />
                Yangilash
              </button>
            </div>

            {/* Bot commands reference */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Bot komandalari</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  { cmd: '/start', desc: "Xush kelibsiz + akkaunt ulash", role: "Barcha" },
                  { cmd: '/balance', desc: "O'z moliyaviy holatini ko'rish", role: "O'quvchi" },
                  { cmd: '/attendance', desc: "Bu oydagi davomat", role: "O'quvchi" },
                  { cmd: '/pay <summa>', desc: "Payme/Click to'lov linki", role: "O'quvchi" },
                  { cmd: '/leads', desc: "Bugungi yangi lidlar", role: "Admin" },
                  { cmd: '/stats', desc: "Umumiy statistika", role: "Admin" },
                  { cmd: '/debtors', desc: "Qarzdorlar ro'yxati", role: "Admin" },
                ].map(c => (
                  <div key={c.cmd} className="flex items-start gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                    <code className="text-blue-600 dark:text-blue-400 text-sm font-mono shrink-0">{c.cmd}</code>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">{c.desc}</p>
                      <span className="text-xs text-zinc-400">{c.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Link Tab */}
        {activeTab === 'link' && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">O'quvchini Telegram ga ulash</h3>
            <p className="text-sm text-zinc-500">
              O'quvchining Telegram Chat ID sini kiriting va uni tizimga ulang.
              O'quvchi botga /start yuborganda Chat ID uning Telegram profilida ko'rinadi
              yoki <ExternalLink className="w-3 h-3 inline" /> @userinfobot orqali bilib olinadi.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  O'quvchini qidirish
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Ism yoki telefon..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
                  {filteredStudents.slice(0, 20).map(s => (
                    <button
                      key={s.id}
                      onClick={() => setLinkStudentId(s.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${
                        linkStudentId === s.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <span className="text-blue-600 dark:text-blue-400 text-xs font-bold">{s.name[0]}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{s.name}</p>
                        <p className="text-xs text-zinc-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />{s.phone || '—'}
                          {s.notes?.includes('tg:') && (
                            <span className="text-emerald-600 ml-1">✓ Ulangan</span>
                          )}
                        </p>
                      </div>
                      {linkStudentId === s.id && <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  placeholder="Masalan: 123456789"
                  value={linkChatId}
                  onChange={e => setLinkChatId(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-zinc-400 mt-1">O'quvchi @userinfobot ga /start yuborganida Chat ID paydo bo'ladi</p>
              </div>

              <button
                onClick={handleLinkStudent}
                disabled={linkLoading || !linkStudentId || !linkChatId}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {linkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Ulash va xabar yuborish
              </button>
            </div>
          </div>
        )}

        {/* Broadcast Tab */}
        {activeTab === 'broadcast' && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Ommaviy xabar yuborish</h3>
            <p className="text-sm text-zinc-500">
              Telegram ga ulangan o'quvchilarga xabar yuboring.
              HTML teglari qo'llaniladi: &lt;b&gt;, &lt;i&gt;, &lt;code&gt;.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Qabul qiluvchilar
                </label>
                <select
                  value={broadcastTarget}
                  onChange={e => setBroadcastTarget(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Barcha faol o'quvchilar</option>
                  <option value="debtors">Faqat qarzdorlar</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Xabar matni
                </label>
                <textarea
                  rows={6}
                  placeholder="Xabar matnini kiriting...\n\nMasalan:\n🎓 <b>Tayyorlovmarkaz</b>\n\nHurmatli o'quvchi, ..."
                  value={broadcastMsg}
                  onChange={e => setBroadcastMsg(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                />
                <p className="text-xs text-zinc-400 mt-1">{broadcastMsg.length} belgi</p>
              </div>

              {/* Preview */}
              {broadcastMsg && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">Ko'rinish</p>
                  <div
                    className="text-sm text-zinc-800 dark:text-zinc-200"
                    dangerouslySetInnerHTML={{ __html: broadcastMsg.replace(/\n/g, '<br/>') }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-500">
                  <MessageSquare className="w-4 h-4 inline mr-1" />
                  ~{linkedCount} ta o'quvchiga yuboriladi
                </div>
                <button
                  onClick={handleBroadcast}
                  disabled={broadcastLoading || !broadcastMsg.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {broadcastLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Yuborish
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Setup Tab */}
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Webhook sozlash</h3>
              <p className="text-sm text-zinc-500">
                Bot webhook URL ini Telegram ga ro'yxatdan o'tkazing.
                URL sizning domeningiz bo'lishi kerak (HTTPS majburiy).
              </p>
              <div className="flex gap-3">
                <input
                  type="url"
                  placeholder="https://sizning-domain.uz/api/telegram/webhook"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSetWebhook}
                  disabled={webhookLoading || !webhookUrl.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
                >
                  {webhookLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                  Sozlash
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">.env sozlamalari</h3>
              <div className="space-y-2 font-mono text-sm bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-x-auto">
                <p><span className="text-zinc-400"># server/.env ga qo'shing:</span></p>
                <p><span className="text-emerald-400">TELEGRAM_BOT_TOKEN</span>=<span className="text-amber-400">your_bot_token</span></p>
                <p><span className="text-emerald-400">TELEGRAM_WEBHOOK_SECRET</span>=<span className="text-amber-400">random_secret_string</span></p>
                <p><span className="text-emerald-400">TELEGRAM_ADMIN_IDS</span>=<span className="text-amber-400">123456789,987654321</span></p>
              </div>
              <button
                onClick={() => {
                  const text = 'TELEGRAM_BOT_TOKEN=your_bot_token\nTELEGRAM_WEBHOOK_SECRET=random_secret\nTELEGRAM_ADMIN_IDS=your_chat_id';
                  navigator.clipboard.writeText(text);
                  showToast('Nusxalandi!', 'success');
                }}
                className="mt-3 flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <Copy className="w-3.5 h-3.5" /> Nusxalash
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
