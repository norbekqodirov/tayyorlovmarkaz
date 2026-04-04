import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title = "Tasdiqlash",
  message,
  confirmText = "Ha, davom etish",
  cancelText = "Bekor qilish",
  type = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const btnColors = {
    danger: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20',
    warning: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20',
    info: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
  };

  const iconColors = {
    danger: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600',
    warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="p-6 text-center">
          <div className={`w-14 h-14 rounded-full ${iconColors[type]} flex items-center justify-center mx-auto mb-4`}>
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
          <p className="text-sm text-zinc-500">{message}</p>
        </div>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-3 bg-zinc-50 dark:bg-zinc-950/50">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl transition-colors shadow-lg ${btnColors[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
