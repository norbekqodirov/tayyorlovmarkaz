import React from 'react';
import { PackageOpen, AlertCircle } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ 
  title = "Ma'lumot topilmadi", 
  message = "Bu yerda hali hech qanday ma'lumot mavjud emas. Yangi qo'shishdan boshlang.", 
  actionLabel, 
  onAction,
  icon
}: EmptyStateProps) {
  return (
    <div className="w-full flex justify-center py-16">
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800/50 rounded-full flex items-center justify-center text-zinc-400 mb-5">
          {icon || <PackageOpen size={40} strokeWidth={1.5} />}
        </div>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3>
        <p className="text-sm font-medium text-slate-500 mb-6 mt-2">{message}</p>
        {actionLabel && onAction && (
          <button 
            onClick={onAction}
            className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Serverga ulanishda xatolik yuz berdi.", onRetry }: ErrorStateProps) {
  return (
    <div className="w-full flex justify-center py-12">
      <div className="flex justify-center items-center flex-col text-center border border-rose-200 dark:border-rose-900/30 bg-rose-50 dark:bg-rose-500/5 p-8 rounded-[24px] max-w-md">
        <AlertCircle size={48} className="text-rose-500 mb-4" strokeWidth={1.5} />
        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">Nosozlik</h3>
        <p className="text-sm text-rose-600 dark:text-rose-400 font-medium mb-5">{message}</p>
        
        {onRetry && (
           <button 
             onClick={onRetry}
             className="px-5 py-2.5 bg-white dark:bg-zinc-800 text-slate-700 dark:text-white font-bold rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-sm hover:bg-rose-50"
           >
             Qayta urinish
           </button>
        )}
      </div>
    </div>
  );
}
