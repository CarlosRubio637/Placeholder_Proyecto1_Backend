export type AllowedImageType = 'image/jpeg' | 'image/png';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(buffer: Uint8Array, signature: number[]): boolean {
  return (
    buffer.length >= signature.length &&
    signature.every((byte, i) => buffer[i] === byte)
  );
}

/**
 * Tipo real de la imagen según sus primeros bytes ("magic numbers"), sin
 * confiar en la extensión ni en el Content-Type que manda el cliente (H10).
 * Devuelve null si no es JPG ni PNG.
 */
export function detectImageType(buffer: Uint8Array): AllowedImageType | null {
  if (startsWith(buffer, PNG_SIGNATURE)) return 'image/png';
  if (startsWith(buffer, JPEG_SIGNATURE)) return 'image/jpeg';
  return null;
}

export const IMAGE_EXTENSIONS: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
