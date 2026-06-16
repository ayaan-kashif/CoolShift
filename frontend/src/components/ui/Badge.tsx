import React from 'react';

type Color = 'primary' | 'danger' | 'warning' | 'success';

type Props = {
  children: React.ReactNode;
  color?: Color;
  className?: string;
};

export default function Badge({ children, color = 'primary', className = '' }: Props) {
  const bg = {
    primary: 'bg-teal-500/30 text-teal-200',
    danger: 'bg-red-500/30 text-red-200',
    warning: 'bg-yellow-500/30 text-yellow-200',
    success: 'bg-green-500/30 text-green-200',
  }[color];

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-sm font-medium ${bg} ${className}`}>
      {children}
    </span>
  );
}
