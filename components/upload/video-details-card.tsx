'use client';

import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatBytes, formatDuration } from '@/lib/utils';
import { captureVideoThumbnail } from '@/lib/upload/read-video-metadata';
import type { VideoMetadata } from '@/lib/upload/read-video-metadata';

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
    <Card className="flex gap-3 p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL local, sem otimização de imagem aplicável
          <img src={thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <Film size={22} className="text-slate-400" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium text-slate-900 dark:text-white">{file.name}</p>
        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
          {formatBytes(file.size)}
          {metadata ? ` · ${formatDuration(metadata.duration)} · ${metadata.width}×${metadata.height} · ${aspectRatioLabel(metadata.width, metadata.height)}` : ''}
        </p>
      </div>
    </Card>
  );
}
