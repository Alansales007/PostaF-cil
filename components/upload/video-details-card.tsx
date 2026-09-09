'use client';

import { useEffect, useState } from 'react';
import { Film, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatBytes, formatDuration } from '@/lib/utils';
import { captureVideoThumbnail } from '@/lib/upload/read-video-metadata';
import type { VideoMetadata } from '@/lib/upload/read-video-metadata';
import { VideoPreviewModal } from '@/components/upload/video-preview-modal';

interface Props {
  file: File;
  metadata: VideoMetadata | null;
}

function aspectRatioLabel(width?: number, height?: number): string {
  if (!width || !height) return '—';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function VideoDetailsCard({ file, metadata }: Props) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    captureVideoThumbnail(file)
      .then((url) => active && setThumbnail(url))
      .catch(() => {
        /* sem thumbnail — segue mostrando o ícone genérico */
      });
    return () => {
      active = false;
    };
  }, [file]);

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setPreviewOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && setPreviewOpen(true)}
        className="flex cursor-pointer gap-3 p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local, sem otimização de imagem aplicável
            <img src={thumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <Film size={22} className="text-slate-400" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90">
              <Play size={14} className="ml-0.5 text-slate-900" fill="currentColor" />
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-medium text-slate-900 dark:text-white">{file.name}</p>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">
            {formatBytes(file.size)}
            {metadata ? ` · ${formatDuration(metadata.duration)} · ${metadata.width}×${metadata.height} · ${aspectRatioLabel(metadata.width, metadata.height)}` : ''}
          </p>
          <p className="mt-1 text-xs text-brand-600 dark:text-brand-400">Toque para pré-visualizar</p>
        </div>
      </Card>

      {previewOpen && <VideoPreviewModal file={file} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}
