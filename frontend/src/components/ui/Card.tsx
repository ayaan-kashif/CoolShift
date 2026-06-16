// file:///C:/Users/Hp/OneDrive/Desktop%202/CoolShift/CoolShift/frontend/src/components/ui/Card.tsx
import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

type Props = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export default function Card({ children, className = '', hover = false }: Props) {
  return (
    <motion.div
      className={`glass-panel p-6 ${hover ? 'card-hover' : ''} transition-all duration-300 animate-fade-in ${className}`}
      whileHover={hover ? { scale: 1.03 } : undefined}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
