import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle2, AlertOctagon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../api/client';
import { useSocket } from '../hooks/useSocket';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'alert' | 'success' | 'warning';
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, any> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  alert: AlertOctagon,
};

const TYPE_COLOR: Record<string, string> = {
  info: 'text-blue-500 bg-blue-50 dark:bg-blue-500/15',
  success: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/15',
  warning: 'text-amber-500 bg-amber-50 dark:bg-amber-500/15',
  alert: 'text-rose-500 bg-rose-50 dark:bg-rose-500/15',
};

function formatRelativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'hozir';
  if (diff < 3600) return `${Math.floor(diff / 60)} daq oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  return `${Math.floor(diff / 86400)} kun oldin`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get('/notifications');
      const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setNotifications(data.slice(0, 50));
    } catch (err) {
      console.warn('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Real-time push via WebSocket
  useSocket<Notification>('notification:new', (notif) => {
    setNotifications(prev => [{
      ...notif,
      id: notif.id || `tmp-${Date.now()}`,
      isRead: false,
      createdAt: notif.createdAt || new Date().toISOString(),
    }, ...prev].slice(0, 50));
    setHasNew(true);

    // Browser notification (if permission granted)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(notif.title, { body: notif.message, icon: '/favicon.ico' });
      }
    } catch {}

    // Sound (optional, silent fail)
    try { audioRef.current?.play().catch(() => {}); } catch {}

    // Clear new badge after a moment
    setTimeout(() => setHasNew(false), 3500);
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Request notification permission once
  useEffect(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        // Don't ask immediately; only when user clicks bell
      }
    } catch {}
  }, []);

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await api.put(`/notifications/${id}`, { isRead: true });
    } catch {}
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await Promise.all(unread.map(n => api.put(`/notifications/${n.id}`, { isRead: true })));
    } catch {}
  };

  const removeNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await api.delete(`/notifications/${id}`);
    } catch {}
  };

  const handleOpen = () => {
    setOpen(!open);
    setHasNew(false);
    // Request permission lazily on first open
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {}
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
        aria-label="Bildirishnomalar"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
        {hasNew && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-96 max-w-[90vw] max-h-[600px] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Bildirishnomalar</h3>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} ta yangi` : 'Hammasini ko\'rildi'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1"
                    title="Hammasini o'qildi deb belgilash"
                  >
                    <CheckCheck size={14} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-zinc-400">
                  <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin mb-2" />
                  <p className="text-xs font-bold">Yuklanmoqda...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-center">
                  <Bell size={32} className="text-zinc-300 dark:text-zinc-700 mb-2" />
                  <p className="text-sm font-bold text-zinc-400">Bildirishnoma yo'q</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-[200px]">
                    Yangi voqealar bu yerda paydo bo'ladi
                  </p>
                </div>
              ) : (
                <div>
                  {notifications.map((n) => {
                    const Icon = TYPE_ICON[n.type] || Info;
                    return (
                      <div
                        key={n.id}
                        className={`group relative px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                          !n.isRead ? 'bg-blue-50/30 dark:bg-blue-500/5' : ''
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className={`w-9 h-9 rounded-xl ${TYPE_COLOR[n.type] || TYPE_COLOR.info} flex items-center justify-center flex-shrink-0`}>
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-black text-slate-900 dark:text-white">{n.title}</p>
                              {!n.isRead && (
                                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                              )}
                            </div>
                            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                              {n.message}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                                {formatRelativeTime(new Date(n.createdAt))}
                              </span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!n.isRead && (
                                  <button
                                    onClick={() => markRead(n.id)}
                                    className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-500"
                                    title="O'qildi"
                                  >
                                    <Check size={12} />
                                  </button>
                                )}
                                <button
                                  onClick={() => removeNotification(n.id)}
                                  className="p-1 rounded-md hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-500"
                                  title="O'chirish"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification sound (silent fallback if no file) */}
      <audio ref={audioRef} preload="none">
        <source src="/notification.mp3" type="audio/mpeg" />
      </audio>
    </div>
  );
}

export default NotificationCenter;
