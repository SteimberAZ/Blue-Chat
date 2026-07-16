'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type BlueChatDialogProps = {
  title?: string;
  labelledBy?: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
};

export default function BlueChatDialog({ title, labelledBy, onClose, children, className = '' }: BlueChatDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter(element => !element.hasAttribute('disabled'));
      if (elements.length < 2) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div
        ref={dialogRef}
        className={`relative max-h-[min(90dvh,48rem)] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8 ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={!labelledBy ? title : undefined}
      >
        {title && <h2 id={labelledBy} className="sr-only">{title}</h2>}
        {onClose && (
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar diálogo">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
