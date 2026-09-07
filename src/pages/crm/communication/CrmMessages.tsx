import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Search, ArrowLeft } from 'lucide-react';
import api from '../../../api/client';
import { useSocket } from '../../../hooks/useSocket';
import { ErrorState } from '../../../components/States';
import { getCurrentRoleLevel, ROLE_LEVEL } from '../../../utils/roles';

export default function CrmMessages() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [convsError, setConvsError] = useState<string | null>(null);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsError, setMsgsError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const userRoleLevel = getCurrentRoleLevel();
  // Backend route requirement: POST /api/messages requires requireAuth (level >= 1 TEACHER)
  const canSend = userRoleLevel >= ROLE_LEVEL.TEACHER;

  const currentUserId = (() => {
    try { return JSON.parse(localStorage.getItem('crm_user') || '{}')?.id || ''; } catch { return ''; }
  })();

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { if (selected) loadMessages(selected); }, [selected]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useSocket<any>('message:new', (msg) => {
    if (msg.senderId === selected || msg.receiverId === selected) {
      setMessages(prev => [...prev, msg]);
    }
    loadConversations();
  });

  const loadConversations = async () => {
    setLoading(true);
    setConvsError(null);
    try {
      const res = await api.get('/messages');
      setConversations(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setConvsError(err.response?.data?.message || err.message || "Suhbatlarni yuklashda xatolik yuz berdi");
      setConversations([]);
    }
    setLoading(false);
  };

  const loadMessages = async (partnerId: string) => {
    setMsgsLoading(true);
    setMsgsError(null);
    try {
      const res = await api.get(`/messages/${partnerId}`);
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setMsgsError(err.response?.data?.message || err.message || "Xabarlarni yuklashda xatolik yuz berdi");
      setMessages([]);
    }
    setMsgsLoading(false);
  };

  const sendMessage = async () => {
    if (!text.trim() || !selected || !canSend) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api.post('/messages', { receiverId: selected, content: text.trim() });
      setMessages(prev => [...prev, res.data]);
      setText('');
    } catch (err: any) {
      setSendError(err.response?.data?.message || err.message || "Xabar yuborishda xatolik yuz berdi");
    }
    setSending(false);
  };

  const filtered = conversations.filter(c =>
    !search || c.partnerName?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedConv = conversations.find(c => c.partnerId === selected);

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
      {/* Sidebar */}
      <div className={`w-full md:w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="font-black text-sm text-slate-900 dark:text-white mb-3">Xabarlar</h2>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Qidirish..."
              className="w-full pl-8 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convsError ? (
            <ErrorState message={convsError} onRetry={loadConversations} />
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">Suhbatlar yo'q</div>
          ) : (
            filtered.map(conv => (
              <button key={conv.partnerId} onClick={() => setSelected(conv.partnerId)}
                className={`w-full flex items-center gap-3 p-3.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                  selected === conv.partnerId ? 'bg-blue-50 dark:bg-blue-500/10 border-r-2 border-r-blue-600' : ''}`}>
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0">
                  {(conv.partnerName || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{conv.partnerName}</span>
                    {conv.unread > 0 && (
                      <span className="w-4 h-4 bg-blue-600 rounded-full text-white text-[9px] font-black flex items-center justify-center shrink-0">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                  {conv.lastMsg && (
                    <p className="text-[10px] text-zinc-400 truncate mt-0.5">{conv.lastMsg.content}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      {selected ? (
        <div className="flex-1 flex flex-col w-full">
          <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <button
              onClick={() => setSelected(null)}
              className="md:hidden p-1.5 -ml-1 text-zinc-600 dark:text-zinc-400 hover:text-slate-900 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Orqaga"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs">
              {(selectedConv?.partnerName || '?').charAt(0)}
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">{selectedConv?.partnerName}</p>
              <p className="text-[10px] text-zinc-400">{selectedConv?.partnerRole || 'Foydalanuvchi'}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgsLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : msgsError ? (
              <ErrorState message={msgsError} onRetry={() => selected && loadMessages(selected)} />
            ) : (
              messages.map(msg => {
                const isMine = msg.senderId === currentUserId;
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
              })
            )}
            <div ref={bottomRef} />
          </div>

          {sendError && (
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-500/10 border-t border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {sendError}
            </div>
          )}

          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <input value={text} onChange={e => {
                setText(e.target.value);
                if (sendError) setSendError(null);
              }}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={canSend ? "Xabar yozing..." : "Ruxsat yetarli emas"}
              disabled={!canSend}
              className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
            <button onClick={sendMessage} disabled={!text.trim() || sending || !canSend}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all">
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center">
            <MessageCircle size={48} className="text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="font-bold text-zinc-500">Suhbat tanlang</p>
            <p className="text-sm text-zinc-400 mt-1">Chap paneldan suhbatni tanlang</p>
          </div>
        </div>
      )}
    </div>
  );
}

