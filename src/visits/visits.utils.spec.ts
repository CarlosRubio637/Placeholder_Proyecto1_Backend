import { DocumentType } from '@PrismaClient';
import { VISIT_CODE_ALPHABET } from './visits.constants.js';
import {
  cleanName,
  condominiumInstant,
  documentLabel,
  generateVisitCode,
  normalizeDocument,
  toMinutes,
  visitSearchKey,
} from './visits.utils.js';

describe('utilidades de visitas', () => {
  it('genera códigos de 6 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVisitCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
    expect(VISIT_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('usa el generador recibido para cada carácter', () => {
    const random = vi.fn().mockReturnValueOnce(0).mockReturnValue(30);
    expect(generateVisitCode(random)).toBe('A99999');
    expect(random).toHaveBeenCalledWith(VISIT_CODE_ALPHABET.length);
  });

  it('convierte HH:mm a minutos', () => {
    expect(toMinutes('06:00')).toBe(360);
    expect(toMinutes('22:00')).toBe(1320);
    expect(toMinutes('13:45')).toBe(825);
  });

  it('calcula el instante en la hora del condominio (UTC−6)', () => {
    expect(condominiumInstant('2026-11-10', '06:00').toISOString()).toBe(
      '2026-11-10T12:00:00.000Z',
    );
    expect(condominiumInstant('2026-11-10', '22:00').toISOString()).toBe(
      '2026-11-11T04:00:00.000Z',
    );
  });

  it('limpia espacios del nombre', () => {
    expect(cleanName('  Ana   María  ')).toBe('Ana María');
  });

  it('guarda el pasaporte en mayúsculas y el DUI tal cual', () => {
    expect(normalizeDocument(DocumentType.PASAPORTE, 'ab12345')).toBe(
      'AB12345',
    );
    expect(normalizeDocument(DocumentType.DUI, '01234567-8')).toBe(
      '01234567-8',
    );
  });

  it('arma la clave de búsqueda sin tildes y en minúsculas', () => {
    expect(visitSearchKey('José Peña', 'AB12345')).toBe('jose pena ab12345');
  });

  it('describe el documento para el aviso', () => {
    expect(documentLabel(DocumentType.DUI, '01234567-8')).toBe(
      'DUI 01234567-8',
    );
    expect(documentLabel(DocumentType.PASAPORTE, 'AB12345')).toBe(
      'Pasaporte AB12345',
    );
  });
});
