import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type SnackbarVariant = 'success' | 'error' | 'info';

interface SnackbarItem {
  id: number;
  message: string;
  variant: SnackbarVariant;
}

interface SnackbarContextValue {
  showSnackbar: (message: string, variant?: SnackbarVariant) => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({
  showSnackbar: () => {},
});

export const useSnackbar = () => useContext(SnackbarContext);

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const showSnackbar = useCallback(
    (message: string, variant: SnackbarVariant = 'success') => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 4500);
    },
    [dismiss]
  );

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      {/* Global Floating Snackbar Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {items.map((item) => {
          const styles =
            item.variant === 'success'
              ? 'bg-emerald-950/95 text-emerald-50 border-emerald-500/60 shadow-emerald-950/40'
              : item.variant === 'error'
              ? 'bg-rose-950/95 text-rose-50 border-rose-500/60 shadow-rose-950/40'
              : 'bg-slate-900/95 text-slate-50 border-slate-600/60 shadow-slate-900/40';

          const Icon =
            item.variant === 'success'
              ? CheckCircle2
              : item.variant === 'error'
              ? AlertCircle
              : Info;

          const iconColor =
            item.variant === 'success'
              ? 'text-emerald-400'
              : item.variant === 'error'
              ? 'text-rose-400'
              : 'text-sky-400';

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all ${styles}`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 text-xs font-medium leading-relaxed">{item.message}</div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-white/60 hover:text-white p-0.5 rounded transition"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </SnackbarContext.Provider>
  );
};
