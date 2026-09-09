'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  file: File;
  onClose: () => void;
}

/**
 * Preview do vídeo antes de publicar — toca o arquivo local direto
 * (URL.createObjectURL), sem precisar subir nada nem depender do storage.
 */
export function VideoPreviewModal({ file, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === containerRef.current) onClose();
      }}
      ref={containerRef}
    >
      <div className="relative w-full max-w-sm">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute -top-11 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X size={20} />
        </button>
        {url && (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            className="max-h-[80vh] w-full rounded-2xl bg-black"
          />
        )}
      </div>
    </div>
  );
}
