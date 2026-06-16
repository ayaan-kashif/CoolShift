// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/components/ui/AlertBanner.tsx
import React from 'react';

type Props = {
  type: 'success' | 'error' | 'warning';
  message: string;
  onClose?: () => void;
};

export default function AlertBanner({ type, message, onClose }: Props) {
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
