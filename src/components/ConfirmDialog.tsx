import { AlertTriangle } from 'lucide-react';
import { Modal } from './ui/Modal';

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
    <Modal isOpen={isOpen} onClose={onCancel} title={title} width="sm">
      <div className="text-center">
        <div className={`w-14 h-14 rounded-full ${iconColors[type]} flex items-center justify-center mx-auto mb-4`}>
          <AlertTriangle size={24} />
        </div>
        <p className="text-sm text-zinc-500">{message}</p>
      </div>
      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-colors"
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
    </Modal>
  );
}
