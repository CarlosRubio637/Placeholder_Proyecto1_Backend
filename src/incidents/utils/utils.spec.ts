import { currentYear, detectImageType, formatIncidentNumber } from './index.js';

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('H10. Registro de incidencia con evidencia', () => {
  it('AC5: reconoce PNG y JPEG por sus primeros bytes', () => {
    expect(
      detectImageType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00),
      ),
    ).toBe('image/png');
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe(
      'image/jpeg',
    );
  });

  it('AC5: rechaza otros formatos aunque se llamen .jpg (comprueba el contenido)', () => {
    expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
    expect(detectImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // PDF
    expect(detectImageType(new TextEncoder().encode('hola.jpg'))).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull(); // demasiado corto
  });
});

describe('H10. Registro de incidencia con evidencia', () => {
  it('AC4: arma el número INC-AAAA-NNNNN con ceros a la izquierda', () => {
    expect(formatIncidentNumber(2026, 1)).toBe('INC-2026-00001');
    expect(formatIncidentNumber(2026, 12345)).toBe('INC-2026-12345');
  });
});

describe('H10. Registro de incidencia con evidencia', () => {
  it('AC4: el año del número es el de El Salvador (UTC-6), no el del servidor', () => {
    // 1 de enero 03:00 UTC = 31 de diciembre 21:00 en El Salvador.
    expect(currentYear(new Date('2027-01-01T03:00:00Z'))).toBe(2026);
    expect(currentYear(new Date('2027-01-01T07:00:00Z'))).toBe(2027);
  });
});
