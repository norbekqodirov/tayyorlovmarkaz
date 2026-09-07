import React, { useEffect, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'screen';
  showCloseButton?: boolean;
}

const WIDTHS = {
  'sm': 'max-w-sm',
  'md': 'max-w-md',
  'lg': 'max-w-lg',
  'xl': 'max-w-xl',
  '2xl': 'max-w-2xl',
  'screen': 'w-full h-full sm:h-auto sm:max-w-[calc(100vw-2rem)]'
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  width = 'md',
  showCloseButton = true
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // onClose ko'pincha chaqiruvchi tomonda memoized bo'lmagan inline funksiya
  // (masalan onClose={() => setIsModalOpen(false)}) — bu holda har bir render'da
  // yangi identifikatorga ega bo'ladi. Ref orqali saqlab, quyidagi effect'ni
  // faqat isOpen'ga bog'liq qilamiz (onClose'ning eng so'nggi qiymati baribir
  // ishlatiladi, lekin effect har form maydoniga harf kiritilganda qayta
  // ishga tushib, fokusni modal ichidagi birinchi elementga (odatda "Yopish"
  // tugmasi) qaytarib yubormaydi).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Modal ochilganda avvalgi fokuslangan elementni saqlab qolish
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Modal ichidagi birinchi fokuslanuvchi elementga (yoki modal konteyneriga) fokus o'tkazish.
    // "Yopish" tugmasi sarlavha qatorida, forma maydonlaridan OLDIN joylashgan —
    // shuning uchun u har doim "birinchi fokuslanuvchi element" bo'lib chiqadi,
    // holbuki foydalanuvchi odatda formaning birinchi maydoniga yozishni kutadi.
    // Tab orqali "Yopish"ga hali ham yetish mumkin — bu faqat DASTLABKI fokus tanlovi.
    const focusTimer = requestAnimationFrame(() => {
      if (!modalRef.current) return;
      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(
        (el) =>
          el.tabIndex !== -1 &&
          !el.hasAttribute('disabled') &&
          (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)
      );

      const preferred = focusableElements.find((el) => el !== closeButtonRef.current);
      if (preferred) {
        preferred.focus();
      } else if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        modalRef.current.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape tugmasi bosilganda modalni yopish
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      // Focus trap: fokus modal ichida qolishini ta'minlash (Tab / Shift+Tab)
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(
          (el) =>
            el.tabIndex !== -1 &&
            !el.hasAttribute('disabled') &&
            (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: orqaga yurganda birinchi elementdan oxirgisiga o'tish
          if (
            document.activeElement === firstElement ||
            document.activeElement === modalRef.current ||
            !modalRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: oldinga yurganda oxirgi elementdan birinchisiga o'tish
          if (
            document.activeElement === lastElement ||
            !modalRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(focusTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      // Modal yopilganda fokusni uni ochgan elementga qaytarish
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === 'function'
      ) {
        previousActiveElement.current.focus();
        previousActiveElement.current = null;
      }
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            aria-hidden="true"
          />
          <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descriptionId : undefined}
              tabIndex={-1}
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`${WIDTHS[width]} w-full bg-white dark:bg-zinc-900 rounded-[24px] shadow-2xl border border-zinc-200 dark:border-zinc-800 pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden outline-none`}
            >
              <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800/50 flex items-start justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                <div>
                  <h2 id={titleId} className="text-xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h2>
                  {description && <p id={descriptionId} className="text-sm font-medium text-slate-500 dark:text-zinc-400 mt-1">{description}</p>}
                </div>
                {showCloseButton && (
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Yopish"
                    className="p-2 -mr-2 -mt-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
              <div className="p-6 overflow-y-auto">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
