import type { PrismaService } from '@Prisma/services';
import { DocumentType, VisitStatus } from '@PrismaClient';
import {
  InsideVisitsService,
  minutesBetween,
  normalizeSearch,
} from './inside-visits.service.js';

const NOW = new Date('2026-11-19T22:31:00Z'); // 16:31 en El Salvador
const ENTRY = new Date('2026-11-19T14:05:00Z'); // 08:05

const row = (change: object = {}) => ({
  id: 'visit-1',
  visitorName: 'Carlos Pineda',
  documentType: DocumentType.DUI,
  documentNumber: '01234567-8',
  reason: 'Plomero',
  entryAt: ENTRY,
  unit: { code: 'C-201' },
  ...change,
});

function setup() {
  const prisma = {
    visit: {
      count: vi.fn().mockResolvedValue(4),
      findMany: vi.fn().mockResolvedValue([row()]),
    },
  };
  const service = new InsideVisitsService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('normalizeSearch (H18)', () => {
  it('quita tildes, pasa a minúsculas y deja espacios simples', () => {
    expect(normalizeSearch('  José   PÉREZ ')).toBe('jose perez');
    expect(normalizeSearch('C1112223')).toBe('c1112223');
  });
});

describe('minutesBetween (H18)', () => {
  it('cuenta minutos completos y nunca da negativo', () => {
    expect(minutesBetween(ENTRY, NOW)).toBe(8 * 60 + 26);
    expect(minutesBetween(NOW, ENTRY)).toBe(0);
  });
});

describe('InsideVisitsService.list (H18)', () => {
  const query = { page: 1, pageSize: 50 };

  it('solo visitas Dentro, sin filtrar por fecha, la entrada más antigua primero', async () => {
    const { service, prisma } = setup();

    await service.list(query, NOW);

    const args = prisma.visit.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: VisitStatus.DENTRO });
    expect(args.orderBy).toEqual([{ entryAt: 'asc' }, { id: 'asc' }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(50);
  });

  it('calcula el tiempo dentro en el servidor', async () => {
    const { service } = setup();

    const result = await service.list(query, NOW);

    expect(result.data[0]).toEqual({
      id: 'visit-1',
      visitorName: 'Carlos Pineda',
      documentType: DocumentType.DUI,
      documentNumber: '01234567-8',
      unitCode: 'C-201',
      reason: 'Plomero',
      entryAt: ENTRY,
      minutesInside: 506,
    });
  });

  it('filtra por torre y busca por contenido en searchKey, sin tildes ni mayúsculas', async () => {
    const { service, prisma } = setup();

    await service.list({ ...query, towerId: 'tower-c', search: 'PINEDÁ' }, NOW);

    expect(prisma.visit.findMany.mock.calls[0][0].where).toEqual({
      status: VisitStatus.DENTRO,
      unit: { towerId: 'tower-c' },
      searchKey: { contains: 'pineda' },
    });
  });

  it('totalInside cuenta todas las visitas Dentro; total, solo las filtradas', async () => {
    const { service, prisma } = setup();
    prisma.visit.count
      .mockResolvedValueOnce(4) // totalInside
      .mockResolvedValueOnce(1); // total con filtros

    const result = await service.list({ ...query, search: 'pineda' }, NOW);

    expect(prisma.visit.count.mock.calls[0][0]).toEqual({
      where: { status: VisitStatus.DENTRO },
    });
    expect(result).toMatchObject({
      totalInside: 4,
      total: 1,
      page: 1,
      pageSize: 50,
    });
  });

  it('pagina de 50 en 50', async () => {
    const { service, prisma } = setup();
    await service.list({ page: 3, pageSize: 50 }, NOW);
    const args = prisma.visit.findMany.mock.calls[0][0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
  });
});
