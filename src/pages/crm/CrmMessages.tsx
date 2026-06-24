import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, Search } from 'lucide-react';
import api from '../../api/client';
import { useSocket } from '../../hooks/useSocket';

export default function CrmMessages() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

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
    try {
      const res = await api.get('/messages');
      setConversations(Array.isArray(res.data) ? res.data : []);
    } catch { setConversations([]); }
    setLoading(false);
  };

  const loadMessages = async (partnerId: string) => {
    try {
      const res = await api.get(`/messages/${partnerId}`);
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch { setMessages([]); }
  };

  const sendMessage = async () => {
    if (!text.trim() || !selected) return;
    setSending(true);
    try {
      const res = await api.post('/messages', { receiverId: selected, content: text.trim() });
      setMessages(prev => [...prev, res.data]);
      setText('');
    } catch {}
    setSending(false);
  };

  const filtered = conversations.filter(c =>
    !search || c.partnerName?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedConv = conversations.find(c => c.partnerId === selected);

  return (
    <div className="flex h-[calc(100vh-140px)] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
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
        <div className="flex-1 flex flex-col">
          <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-xs">
              {(selectedConv?.partnerName || '?').charAt(0)}
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">{selectedConv?.partnerName}</p>
              <p className="text-[10px] text-zinc-400">{selectedConv?.partnerRole || 'Foydalanuvchi'}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => {
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
            <p className="text-sm text-zinc-400 mt-1">Chap paneldan suhbatni tanlang</p>
          </div>
        </div>
      )}
    </div>
  );
}
