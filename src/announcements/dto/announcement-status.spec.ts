import { condominiumInstant, toDbDate, todayIso } from '@Common/time';
import type { AdminAnnouncementRow } from '../repositories/index.js';
import { AdminAnnouncementSummaryDto } from './admin-announcement-response.dto.js';

const row: AdminAnnouncementRow = {
  id: '5d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a',
  title: 'Corte de agua el 14 de diciembre',
  category: 'CORTE_SERVICIO',
  audience: 'TODOS',
  publishedAt: new Date('2026-12-01T15:00:00.000Z'),
  expiresOn: toDbDate('2026-12-14'),
  towers: [],
  readCount: 3,
  recipientCount: 12,
};

function statusAt(isoDate: string, time: string) {
  const today = todayIso(condominiumInstant(isoDate, time));
  return AdminAnnouncementSummaryDto.fromRow(row, today).status;
}

describe('H25. Publicación de comunicados segmentados', () => {
  it('AC5: sigue Vigente hasta las 23:59 de su fecha de fin y al consultar después pasa a Archivado', () => {
    expect(statusAt('2026-12-01', '09:00')).toBe('VIGENTE');
    expect(statusAt('2026-12-14', '23:59')).toBe('VIGENTE');
    expect(statusAt('2026-12-15', '00:00')).toBe('ARCHIVADO');
  });
});
