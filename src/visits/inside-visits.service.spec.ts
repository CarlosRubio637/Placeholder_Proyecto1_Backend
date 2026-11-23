import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { PrismaService } from '@Prisma/services';
import { DocumentType, VisitStatus, type Role } from '@PrismaClient';
import { InsideVisitsController } from './inside-visits.controller.js';
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

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => InsideVisitsController.prototype.list,
    getClass: () => InsideVisitsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H18. Consulta de visitantes dentro del condominio', () => {
  const query = { page: 1, pageSize: 50 };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1: devuelve el total de visitantes dentro y el total filtrado', async () => {
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

  it('AC1: pagina de 50 en 50', async () => {
    const { service, prisma } = setup();

    await service.list({ page: 3, pageSize: 50 }, NOW);

    const args = prisma.visit.findMany.mock.calls[0][0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(50);
  });

  it('AC2: filtra por torre y busca por contenido sin tildes ni mayúsculas', async () => {
    const { service, prisma } = setup();

    await service.list({ ...query, towerId: 'tower-c', search: 'PINEDÁ' }, NOW);

    expect(prisma.visit.findMany.mock.calls[0][0].where).toEqual({
      status: VisitStatus.DENTRO,
      unit: { towerId: 'tower-c' },
      searchKey: { contains: 'pineda' },
    });
  });

  it('AC2: normaliza la búsqueda igual que searchKey', () => {
    expect(normalizeSearch('  José   PÉREZ ')).toBe('jose perez');
    expect(normalizeSearch('C1112223')).toBe('c1112223');
  });

  it('AC4: solo visitas Dentro, sin filtrar por fecha, la entrada más antigua primero', async () => {
    const { service, prisma } = setup();

    await service.list(query, NOW);

    const args = prisma.visit.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: VisitStatus.DENTRO });
    expect(args.orderBy).toEqual([{ entryAt: 'asc' }, { id: 'asc' }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(50);
  });

  it('AC4: una visita que entró otro día y sigue Dentro aparece en la lista', async () => {
    const { service, prisma } = setup();
    const ayer = new Date('2026-11-18T21:00:00Z');
    prisma.visit.findMany.mockResolvedValue([row({ entryAt: ayer })]);

    const result = await service.list(query, NOW);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].entryAt).toEqual(ayer);
    expect(result.data[0].minutesInside).toBe(25 * 60 + 31);
  });

  it('AC5: calcula el tiempo dentro en el servidor como ahora menos entryAt', async () => {
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
      minutesInside: 8 * 60 + 26,
    });
  });

  it('AC5: sin hora explícita usa la hora del servidor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { service } = setup();

    const result = await service.list(query);

    expect(result.data[0].minutesInside).toBe(8 * 60 + 26);
  });

  it('AC5: cuenta minutos completos y nunca da negativo', () => {
    expect(minutesBetween(ENTRY, NOW)).toBe(8 * 60 + 26);
    expect(minutesBetween(NOW, ENTRY)).toBe(0);
  });

  describe('AC6: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['RESIDENTE', 'ADMINISTRADOR'])(
      'AC6: %s recibe 403 al consultar quién está dentro',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC6: el Personal de seguridad sí consulta la lista', () => {
      expect(guard.canActivate(requestAs('SEGURIDAD'))).toBe(true);
    });
  });
});
