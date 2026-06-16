// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/components/ui/Card.tsx
import React, { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

export default function Card({ children, className = '' }: Props) {
  return (
    <div
      className={`bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 ${className}`}
    >
      {children}
    </div>
  );
}
