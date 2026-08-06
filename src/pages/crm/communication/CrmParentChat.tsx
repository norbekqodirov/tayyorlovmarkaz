/**
 * Ota-ona xabarlari — xodim (menejer/o'qituvchi) tomoni.
 * MANAGER/ADMIN barcha o'quvchilarning "Menejer" suhbatlarini ko'radi;
 * TEACHER faqat o'zi dars beradigan o'quvchilarning suhbatlarini ko'radi.
 * Ota-ona tomoni: TelegramPortal.tsx "Xabar" tabi (server/routes/portal.ts).
 */
import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Search } from 'lucide-react';
import api from '../../../api/client';

export default function CrmParentChat() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const staffKeyPrefix = (() => {
    try {
      const role = JSON.parse(localStorage.getItem('crm_user') || '{}')?.role;
      return ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role) ? 'staff:manager' : 'staff:teacher';
    } catch { return 'staff:manager'; }
  })();

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => { if (selected) loadMessages(selected); }, [selected]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadThreads = async () => {
    try {
      const res = await api.get('/parent-chat/threads');
      setThreads(Array.isArray(res.data) ? res.data : []);
    } catch { setThreads([]); }
    setLoading(false);
  };

  const loadMessages = async (studentId: string) => {
    try {
      const res = await api.get(`/parent-chat/threads/${studentId}`);
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch { setMessages([]); }
  };

  const sendMessage = async () => {
    if (!text.trim() || !selected) return;
    setSending(true);
    try {
      const res = await api.post(`/parent-chat/threads/${selected}`, { content: text.trim() });
      setMessages(prev => [...prev, res.data]);
      setText('');
    } catch {}
    setSending(false);
  };

  const filtered = threads.filter(t =>
    !search || t.studentName?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedThread = threads.find(t => t.studentId === selected);

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="font-black text-sm text-slate-900 dark:text-white mb-1">Ota-ona xabarlari</h2>
          <p className="text-[10px] text-zinc-400 mb-3">
            {staffKeyPrefix === 'staff:manager' ? 'Barcha o\'quvchilar (menejer sifatida)' : 'Sizning o\'quvchilaringiz'}
          </p>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="O'quvchi qidirish..."
              className="w-full pl-8 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">Hozircha xabar yo'q</div>
          ) : (
            filtered.map(th => (
              <button key={th.studentId} onClick={() => setSelected(th.studentId)}
                className={`w-full flex items-center gap-3 p-3.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                  selected === th.studentId ? 'bg-blue-50 dark:bg-blue-500/10 border-r-2 border-r-blue-600' : ''}`}>
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0 overflow-hidden">
                  {th.studentPhoto ? <img src={th.studentPhoto} alt={th.studentName} className="w-full h-full object-cover" /> : (th.studentName || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{th.studentName}</span>
                    {th.unread > 0 && (
                      <span className="w-4 h-4 bg-blue-600 rounded-full text-white text-[9px] font-black flex items-center justify-center shrink-0">
                        {th.unread}
                      </span>
                    )}
                  </div>
                  {th.parentName && <p className="text-[10px] text-zinc-400">{th.parentName}</p>}
                  {th.lastMessage && <p className="text-[10px] text-zinc-400 truncate mt-0.5">{th.lastMessage}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs overflow-hidden">
              {selectedThread?.studentPhoto ? <img src={selectedThread.studentPhoto} alt="" className="w-full h-full object-cover" /> : (selectedThread?.studentName || '?').charAt(0)}
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">{selectedThread?.studentName}</p>
              <p className="text-[10px] text-zinc-400">{selectedThread?.parentName || "Ota-ona"}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => {
              const isMine = msg.senderId.startsWith('staff:');
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm ${
                    isMine
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-slate-900 dark:text-white rounded-bl-sm'}`}>
                    <p className="leading-relaxed">{msg.content}</p>
                    <p className={`text-[9px] mt-1 ${isMine ? 'text-blue-200' : 'text-zinc-400'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Xabar yozing..."
              className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={sendMessage} disabled={!text.trim() || sending}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all">
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <MessageCircle size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="font-bold text-zinc-500">Suhbat tanlang</p>
            <p className="text-sm text-zinc-400 mt-1">Chap paneldan o'quvchini tanlang</p>
          </div>
        </div>
      )}
    </div>
  );
}
