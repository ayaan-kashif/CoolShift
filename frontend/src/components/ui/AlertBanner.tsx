import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

type Props = {
  type: 'success' | 'error' | 'warning';
  message: string;
  onClose?: () => void;
};

// Generic Inline Alert component used across functional pages
export default function GenericAlertBanner({ type, message, onClose }: Props) {
  const bg = {
    success: 'bg-green-500/20 text-green-200',
    error: 'bg-red-500/20 text-red-200',
    warning: 'bg-yellow-500/20 text-yellow-200',
  }[type];

  return (
    <div className={`flex items-center p-3 rounded-md ${bg} mb-4`}>
      <span className="flex-1">{message}</span>
      {onClose && (
        <button className="ml-3 text-xl font-bold leading-none" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}

interface AlertBannerProps {
  onClose: () => void;
}

// Named Top Alert Banner component used by AppLayout
export function AlertBanner({ onClose }: AlertBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 h-12 bg-[#B91C1C] border-b border-red-800/40 flex items-center justify-between px-4 z-50 text-white animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-amber-300" strokeWidth={2.5} />
        </div>
        <div className="flex items-center">
          <span className="text-sm font-semibold">
            Unsafe Comfort: 3 intervals flagged
          </span>
          <span className="text-xs text-neutral-200 ml-3 hidden lg:inline border-l border-white/20 pl-3">
            Temperature setpoints outside of safety range in Server Room 4 & Main Hall.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="text-[11px] py-1 px-3.5 bg-white hover:bg-neutral-100 text-[#B91C1C] font-bold rounded-lg shadow-sm transition-all border-none">
          RESOLVE NOW
        </button>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors p-1"
          aria-label="Close Alert"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
