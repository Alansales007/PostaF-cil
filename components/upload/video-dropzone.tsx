'use client';

import { useRef, useState, type DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

/**
 * Área grande de seleção de vídeo. Usa um <input type="file" accept="video/*">
 * simples (sem o atributo "capture", que forçaria abrir a câmera) — assim o
 * Safari no iPhone abre o seletor padrão com acesso à Fototeca.
 */
export function VideoDropzone({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onSelect(file);
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors',
        dragging
          ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/20'
          : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-900/40 dark:text-brand-300">
        <UploadCloud size={26} />
      </div>
      <div>
        <p className="font-medium text-slate-900 dark:text-white">Selecionar vídeo</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Toque para escolher da Fototeca ou arquivos — MP4, MOV ou WebM
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
