import React from 'react';

export default function LoadingSpinner({ size = 8 }: { size?: number }) {
  return (
    <div
      className={`border-4 border-white/30 border-t-white rounded-full animate-spin w-${size} h-${size} mx-auto`}
    />
  );
}
