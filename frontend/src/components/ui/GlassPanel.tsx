"use client";

import { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

import { motion } from 'framer-motion';

export function GlassPanel({ children, className = '', hover = false }: GlassPanelProps) {
  return (
    <motion.div
      className={`glass-panel p-md ${hover ? 'card-hover' : ''} ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
