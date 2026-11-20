import type { PrismaService } from '@Prisma/services';
import { IncidentsReportRepository } from './incidents-report.repository.js';
import { IncidentsReportService } from './incidents-report.service.js';
import {
  ParticipationReportRepository,
  type AssemblyRow,
} from './participation-report.repository.js';
import { ParticipationReportService } from './participation-report.service.js';

// Viernes 20 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-20T16:00:00Z');

// Lo que el resumen (H37) agrega a los servicios de H34 y H35.
describe('H37. Cifras de los reportes que usa el resumen', () => {
  describe('IncidentsReportService.openSummary', () => {
    it('cuenta todas las abiertas y las de más de 7 días con la regla de H34', async () => {
      const repository = {
        countOpen: vi.fn().mockResolvedValue(9),
        staleOpen: vi.fn().mockResolvedValue({ rows: [], total: 3 }),
      };
      const service = new IncidentsReportService(
        repository as unknown as IncidentsReportRepository,
      );

      expect(await service.openSummary(NOW)).toEqual({
        openTotal: 9,
        staleCount: 3,
      });
      // Creadas antes del inicio del 13 de noviembre en El Salvador: a más
      // tardar el día de hoy − 8, igual que la lista de H34.
      expect(repository.staleOpen).toHaveBeenCalledWith(
        new Date('2026-11-13T06:00:00.000Z'),
        1,
        1,
      );
    });
  });

  describe('IncidentsReportRepository.countOpen', () => {
    it('cuenta Pendiente y En proceso, sin periodo', async () => {
      const count = vi.fn().mockResolvedValue(4);
      const repository = new IncidentsReportRepository({
        incident: { count },
      } as unknown as PrismaService);

      expect(await repository.countOpen()).toBe(4);
      expect(count).toHaveBeenCalledWith({
        where: { status: { in: ['PENDIENTE', 'EN_PROCESO'] } },
      });
    });
  });

  describe('ParticipationReportRepository.lastClosed', () => {
    it('busca la Cerrada más reciente por fecha de cierre', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const repository = new ParticipationReportRepository({
        assembly: { findFirst },
      } as unknown as PrismaService);

      expect(await repository.lastClosed()).toBeNull();
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'CERRADA' },
          orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });
  });

  describe('ParticipationReportService.lastClosed', () => {
    const service = (row: AssemblyRow | null) =>
      new ParticipationReportService({
        lastClosed: vi.fn().mockResolvedValue(row),
      } as unknown as ParticipationReportRepository);

    it('calcula la participación con la fórmula de H35', async () => {
      const row = {
        id: 'a',
        title: 'Asamblea de noviembre',
        status: 'CERRADA',
        openedAt: new Date('2026-11-05T15:30:00Z'),
        _count: { eligibleUnits: 24 },
        topics: [
          { question: 'Uno', _count: { voteParticipations: 18 } },
          { question: 'Dos', _count: { voteParticipations: 12 } },
        ],
      } as AssemblyRow;

      const result = await service(row).lastClosed();

      // (75 + 50) / 2 = 62.5
      expect(result).toMatchObject({
        title: 'Asamblea de noviembre',
        avgParticipationPct: 62.5,
      });
    });

    it('null si no hay asambleas cerradas', async () => {
      expect(await service(null).lastClosed()).toBeNull();
    });
  });
});
