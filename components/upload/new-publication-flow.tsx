'use client';

import { useState } from 'react';
import { VideoDropzone } from '@/components/upload/video-dropzone';
import { VideoDetailsCard } from '@/components/upload/video-details-card';
import { UploadProgressBar } from '@/components/upload/upload-progress-bar';
import { CompatibilityCheck } from '@/components/upload/compatibility-check';
import { PublishPanel } from '@/components/publication/publish-panel';
import { useChunkedUpload } from '@/hooks/use-chunked-upload';
import type { SocialProviderId } from '@/types';

export function NewPublicationFlow({ connectedProviders }: { connectedProviders: SocialProviderId[] }) {
  const [file, setFile] = useState<File | null>(null);
  const { phase, progress, error, mediaId, metadata, startUpload, cancelUpload, retryUpload } = useChunkedUpload();

  function handleSelect(selected: File) {
    setFile(selected);
    startUpload(selected);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Nova publicação</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Selecione um vídeo para começar</p>
      </div>

      {!file && <VideoDropzone onSelect={handleSelect} />}

      {file && (
        <>
          <VideoDetailsCard file={file} metadata={metadata} />
          <UploadProgressBar phase={phase} progress={progress} error={error} onCancel={cancelUpload} onRetry={retryUpload} />
        </>
      )}

      {mediaId && phase === 'done' && (
        <>
          <CompatibilityCheck mediaId={mediaId} />
          <PublishPanel mediaId={mediaId} connectedProviders={connectedProviders} />
        </>
      )}
    </div>
  );
}
