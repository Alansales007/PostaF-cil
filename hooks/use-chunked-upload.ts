'use client';

import { useCallback, useRef, useState } from 'react';
import { ChunkedUploader, type UploadPhase, type UploadProgress } from '@/lib/upload/chunked-uploader';
import { readVideoMetadata, type VideoMetadata } from '@/lib/upload/read-video-metadata';

interface UseChunkedUploadResult {
  phase: UploadPhase;
  progress: UploadProgress | null;
  error: string | null;
  mediaId: string | null;
  metadata: VideoMetadata | null;
  startUpload: (file: File) => void;
  cancelUpload: () => void;
  retryUpload: () => void;
}

export function useChunkedUpload(): UseChunkedUploadResult {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);

  const uploaderRef = useRef<ChunkedUploader | null>(null);
  const fileRef = useRef<File | null>(null);

  const run = useCallback(async (file: File) => {
    fileRef.current = file;
    setError(null);
    setMediaId(null);

    let videoMetadata: VideoMetadata | null = null;
    try {
      videoMetadata = await readVideoMetadata(file);
      setMetadata(videoMetadata);
    } catch {
      // segue sem duração/resolução — não impede o upload
    }

    const uploader = new ChunkedUploader(file, videoMetadata, {
      onPhaseChange: setPhase,
      onProgress: setProgress,
      onError: setError,
      onComplete: setMediaId,
    });
    uploaderRef.current = uploader;

    try {
      await uploader.start();
    } catch {
      // já reportado via onError/onPhaseChange
    }
  }, []);

  const startUpload = useCallback(
    (file: File) => {
      void run(file);
    },
    [run],
  );

  const cancelUpload = useCallback(() => {
    uploaderRef.current?.cancel();
  }, []);

  const retryUpload = useCallback(() => {
    if (fileRef.current) startUpload(fileRef.current);
  }, [startUpload]);

  return { phase, progress, error, mediaId, metadata, startUpload, cancelUpload, retryUpload };
}
