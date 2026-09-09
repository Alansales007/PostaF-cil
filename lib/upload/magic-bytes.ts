/**
 * Validação leve de conteúdo real do arquivo, além do MIME/extensão
 * declarados pelo cliente ("proteção contra upload malicioso").
 *
 * Não substitui a validação definitiva (que é o próprio FFmpeg tentando
 * abrir o arquivo no MediaProcessor) — mas rejeita já na conclusão do
 * upload um arquivo cujos primeiros bytes claramente não correspondem a
 * nenhum container de vídeo conhecido, sem precisar baixar o arquivo
 * inteiro (lemos só os primeiros 64 bytes via StorageService.readHeaderBytes).
 */
export function isLikelyVideoContainer(header: Buffer): boolean {
  if (header.length < 12) return false;

  // ISO base media (MP4/MOV/M4V/3GP): bytes 4-7 == "ftyp"
  if (header.subarray(4, 8).toString('ascii') === 'ftyp') {
    return true;
  }

  // WebM/Matroska: assinatura EBML
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return true;
  }

  // AVI: "RIFF" .... "AVI "
  if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'AVI ') {
    return true;
  }

  return false;
}
