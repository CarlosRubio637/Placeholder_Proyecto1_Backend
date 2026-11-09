import { randomInt } from 'node:crypto';
import { DocumentType } from '@PrismaClient';
import { VISIT_CODE_ALPHABET, VISIT_CODE_LENGTH } from './visits.constants.js';

/** Código de visita de 6 caracteres con un generador criptográfico (H14). */
export function generateVisitCode(
  random: (max: number) => number = randomInt,
): string {
  let code = '';
  for (let i = 0; i < VISIT_CODE_LENGTH; i++) {
    code += VISIT_CODE_ALPHABET[random(VISIT_CODE_ALPHABET.length)];
  }
  return code;
}

/** "HH:mm" → minutos desde la medianoche. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Instante de "AAAA-MM-DD HH:mm" en la hora del condominio. El Salvador está
 * en UTC−6 todo el año, así que el desfase es fijo.
 */
export function condominiumInstant(isoDate: string, time: string): Date {
  return new Date(`${isoDate}T${time}:00.000-06:00`);
}

/** Nombre con espacios simples: "  Ana   María " → "Ana María". */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Documento como se guarda: el pasaporte en mayúsculas, el DUI tal cual. */
export function normalizeDocument(type: DocumentType, value: string): string {
  return type === DocumentType.PASAPORTE ? value.toUpperCase() : value;
}

/** Texto para buscar en H18: nombre y documento en minúsculas, sin tildes. */
export function visitSearchKey(name: string, documentNumber: string): string {
  return `${name} ${documentNumber}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** "DUI 01234567-8" o "Pasaporte A1234567", para el aviso a seguridad. */
export function documentLabel(type: DocumentType, number: string): string {
  return `${type === DocumentType.DUI ? 'DUI' : 'Pasaporte'} ${number}`;
}
