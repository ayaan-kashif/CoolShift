// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/components/ui/Button.tsx
import React, { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
};

export default function Button({
  variant = 'primary',
  disabled,
  loading,
  children,
  className = '',
  ...rest
}: Props) {
  const base = 'rounded-xl px-4 py-2 font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] transform shadow-md';
  const colors = {
    primary: 'bg-[#00d4aa] text-black hover:bg-[#00c49e] disabled:opacity-50',
    secondary: 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50',
    danger: 'bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-50',
  }[variant];
  return (
    <button
      className={`${base} ${colors} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="inline-block animate-spin border-2 border-current border-t-transparent rounded-full w-4 h-4 mr-2 align-middle" />
      ) : null}
      {children}
    </button>
  );
}
