-- AlterTable: campos usados pelo MediaProcessor (detecção de codec via
-- ffprobe e caminho da versão transcodificada, quando o original precisa
-- ser convertido para MP4/H.264/AAC antes de publicar).
ALTER TABLE "media_files"
  ADD COLUMN "videoCodec" TEXT,
  ADD COLUMN "audioCodec" TEXT,
  ADD COLUMN "transcodedStoragePath" TEXT;
