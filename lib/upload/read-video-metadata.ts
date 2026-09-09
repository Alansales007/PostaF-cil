export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

/**
 * Lê duração/resolução do vídeo no navegador usando um <video> fora da tela.
 * Isso só carrega os metadados do container (ex.: o átomo "moov" de um MP4),
 * não o arquivo inteiro — funciona bem inclusive com vídeos grandes
 * selecionados da Fototeca do iPhone via Safari.
 */
export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const metadata: VideoMetadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Não foi possível ler os metadados do vídeo.'));
    };
  });
}

/** Captura um frame próximo do início como thumbnail (data URL JPEG). */
export function captureVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.2, (video.duration || 1) / 2);
      } catch {
        // alguns navegadores lançam se currentTime for setado cedo demais; ignoramos.
      }
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('Canvas indisponível.'));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      cleanup();
      resolve(dataUrl);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Não foi possível gerar a miniatura do vídeo.'));
    };
  });
}
