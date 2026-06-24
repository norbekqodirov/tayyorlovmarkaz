import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutHandlers {
  onNew?:    () => void;
  onEdit?:   () => void;
  onDelete?: () => void;
  onSave?:   () => void;
  onSearch?: () => void;
  onHelp?:   () => void;
}

/**
 * Global keyboard shortcuts hook.
 * - Ctrl+K / Cmd+K → open search
 * - N             → create new (when not in input)
 * - E             → edit (when not in input)
 * - Esc           → close modals (handled by individual components)
 * - Ctrl+S        → save
 * - ?             → show shortcuts help
 * - G D / G S / G F / G L → navigation
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers = {}) {
  const navigate = useNavigate();
  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | null = null;

  const handleKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl+K — search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      handlers.onSearch?.();
      return;
    }

    // Ctrl+S — save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handlers.onSave?.();
      return;
    }

    // Alt+T — theme toggle (handled in CrmLayout)

    if (isInput) return;

    // ? — help
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      handlers.onHelp?.();
      return;
    }

    // N — new
    if (e.key === 'n' || e.key === 'N') {
      handlers.onNew?.();
      return;
    }

    // E — edit
    if (e.key === 'e' || e.key === 'E') {
      handlers.onEdit?.();
      return;
    }

    // Delete — delete
    if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) {
      handlers.onDelete?.();
      return;
    }

    // G-chord navigation
    if (e.key === 'g' || e.key === 'G') {
      gPending = true;
      if (gTimer) clearTimeout(gTimer);
      gTimer = setTimeout(() => { gPending = false; }, 1000);
      return;
    }

    if (gPending) {
      gPending = false;
      if (gTimer) clearTimeout(gTimer);
      const base = '/crmtayyorlovmarkaz';
      switch (e.key.toLowerCase()) {
        case 'd': navigate(`${base}`); break;
        case 's': navigate(`${base}/students`); break;
        case 'f': navigate(`${base}/finance`); break;
        case 'l': navigate(`${base}/leads`); break;
        case 'g': navigate(`${base}/groups`); break;
        case 'r': navigate(`${base}/reports`); break;
        case 'b': navigate(`${base}/bi`); break;
      }
    }
  }, [handlers, navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);
}

export default useKeyboardShortcuts;
