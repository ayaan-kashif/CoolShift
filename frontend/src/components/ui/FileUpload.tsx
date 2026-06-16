'use client';

import React, { useRef, useState } from 'react';

type Props = {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
};

export default function FileUpload({ onFileSelect, accept = '.csv,.xlsx', disabled = false }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={onButtonClick}
      className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
        dragActive
          ? 'border-[#00d4aa] bg-[#00d4aa]/5 scale-[1.01]'
          : 'border-white/20 hover:border-white/40 bg-white/5'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="text-4xl mb-4">📥</div>
      <p className="text-white font-medium text-center">
        {dragActive ? 'Drop your file here' : 'Drag and drop your file here'}
      </p>
      <p className="text-xs text-white/50 mt-2 text-center">
        Only accepts .csv or .xlsx spreadsheets
      </p>
      <button
        type="button"
        className="mt-4 bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-4 rounded-xl text-xs transition-colors"
        disabled={disabled}
      >
        Select File
      </button>
    </div>
  );
}
