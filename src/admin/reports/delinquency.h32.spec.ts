// El handler del controlador se pasa sin llamarlo: RolesGuard lee su metadata
// @Roles.
/* oxlint-disable typescript/unbound-method */
import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { toDbDate } from '@Common/time';
import type { PrismaService } from '@Prisma/services';
import type { Role } from '@PrismaClient';
import { DelinquencyRepository } from './delinquency.repository.js';
import { DelinquencyService } from './delinquency.service.js';
import { DELINQUENCY_MESSAGES } from './reports.constants.js';
import { ReportsController } from './reports.controller.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const RANGE = { from: '2026-01-01', to: '2026-11-22' };

const money = (value: number) => ({ toNumber: () => value });

type GroupByArgs = { _sum?: object; _min?: object };

/** Servicio y repositorio reales sobre un Prisma simulado. */
function setup(
  options: {
    overdue?: string[];
    activeUnits?: number;
    overdueActive?: number;
    sums?: Record<string, number>;
    oldest?: Record<string, string>;
    codes?: Record<string, string>;
  } = {},
) {
  const overdue = options.overdue ?? ['u-1', 'u-2', 'u-3'];
  const sums = options.sums ?? { 'u-1': 90, 'u-2': 45, 'u-3': 45 };
  const oldest = options.oldest ?? {
    'u-1': '2026-08-10',
    'u-2': '2026-10-10',
    'u-3': '2026-10-10',
  };
  const codes = options.codes ?? {
    'u-1': 'B-203',
    'u-2': 'C-101',
    'u-3': 'A-102',
  };
  const prisma = {
    fee: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: money(180) } }),
      groupBy: vi.fn((args: GroupByArgs) => {
        if (args._sum) {
          return Promise.resolve(
            overdue.map((unitId) => ({
              unitId,
              _sum: { amount: money(sums[unitId]) },
            })),
          );
        }
        if (args._min) {
          return Promise.resolve(
            overdue.map((unitId) => ({
              unitId,
              _min: { dueDate: toDbDate(oldest[unitId]) },
            })),
          );
        }
        return Promise.resolve(overdue.map((unitId) => ({ unitId })));
      }),
    },
    unit: {
      count: vi.fn(({ where }: { where: { id?: object } }) =>
        Promise.resolve(
          where.id ? (options.overdueActive ?? 3) : (options.activeUnits ?? 40),
        ),
      ),
      findMany: vi
        .fn()
        .mockResolvedValue(overdue.map((id) => ({ id, code: codes[id] }))),
    },
  };
  const service = new DelinquencyService(
    new DelinquencyRepository(prisma as unknown as PrismaService),
  );
  return { prisma, service };
}

const query = (overrides: object = {}) => ({
  ...RANGE,
  page: 1,
  pageSize: 20,
  ...overrides,
});

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => ReportsController.prototype.getDelinquency,
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

async function badRequestOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse();
}

describe('H32. Panel de morosidad', () => {
  it('AC2: ordena por antigüedad de mayor a menor y, en empate, por código; 20 por página', async () => {
    const { service } = setup();

    const report = await service.getReport(query(), NOW);

    expect(report.data.map((row) => row.unitCode)).toEqual([
      'B-203',
      'A-102',
      'C-101',
    ]);
    expect(report).toMatchObject({ total: 3, page: 1, pageSize: 20 });
  });

  it('AC5: el monto adeudado suma las cuotas Pendiente y Moroso con vencimiento en el rango', async () => {
    const { prisma, service } = setup();

    const report = await service.getReport(query(), NOW);

    expect(prisma.fee.aggregate).toHaveBeenCalledWith({
      where: {
        status: { in: ['PENDIENTE', 'MOROSO'] },
        dueDate: {
          gte: toDbDate('2026-01-01'),
          lte: toDbDate('2026-11-22'),
        },
      },
      _sum: { amount: true },
    });
    expect(report.summary.owedAmount).toBe(180);
  });

  it('AC5: unidad morosa es la que tiene al menos una cuota Moroso en el rango', async () => {
    const { prisma, service } = setup();

    const report = await service.getReport(query(), NOW);

    expect(prisma.fee.groupBy).toHaveBeenCalledWith({
      by: ['unitId'],
      where: {
        status: 'MOROSO',
        dueDate: {
          gte: toDbDate('2026-01-01'),
          lte: toDbDate('2026-11-22'),
        },
      },
    });
    expect(report.summary.overdueUnits).toBe(3);
  });

  it('AC5: el porcentaje es morosas sobre activas, por 100, con un decimal', async () => {
    const { service } = setup({ activeUnits: 3, overdueActive: 1 });

    const { summary } = await service.getReport(query(), NOW);

    // 1 / 3 × 100 = 33.33…
    expect(summary).toMatchObject({
      overdueActiveUnits: 1,
      activeUnits: 3,
      overduePct: 33.3,
    });
  });

  it('AC5: la antigüedad son los días completos desde la cuota impaga más antigua hasta hoy', async () => {
    const { prisma, service } = setup();

    const report = await service.getReport(query(), NOW);

    // Del 10 de agosto al 22 de noviembre de 2026 hay 104 días.
    expect(report.data[0]).toEqual({
      unitCode: 'B-203',
      owedAmount: 90,
      ageDays: 104,
    });
    // El vencimiento más antiguo no aplica el rango: es el de toda la deuda.
    expect(prisma.fee.groupBy).toHaveBeenCalledWith({
      by: ['unitId'],
      where: {
        unitId: { in: ['u-1', 'u-2', 'u-3'] },
        status: { in: ['PENDIENTE', 'MOROSO'] },
      },
      _min: { dueDate: true },
    });
  });

  it('AC6: sin fechas, el rango son los últimos 12 meses hasta hoy', async () => {
    const { prisma, service } = setup();

    await service.getReport({ page: 1, pageSize: 20 }, NOW);

    expect(prisma.fee.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dueDate: {
            gte: toDbDate('2025-11-22'),
            lte: toDbDate('2026-11-22'),
          },
        }),
      }),
    );
  });

  it('AC6: las cuotas Pagado no cuentan en ninguna cifra', async () => {
    const { prisma, service } = setup();

    await service.getReport(query(), NOW);

    const statuses = [
      ...prisma.fee.aggregate.mock.calls,
      ...prisma.fee.groupBy.mock.calls,
    ].map(([args]) => JSON.stringify((args as { where: object }).where));
    for (const where of statuses) expect(where).not.toContain('PAGADO');
  });

  it('AC7: las cifras salen del modelo Fee y de las unidades, las mismas tablas de H2 y H4', async () => {
    const { prisma, service } = setup();

    await service.getReport(query(), NOW);

    expect(prisma.fee.aggregate).toHaveBeenCalled();
    expect(prisma.fee.groupBy).toHaveBeenCalled();
    expect(prisma.unit.count).toHaveBeenCalledWith({
      where: { residents: { some: { role: 'RESIDENTE', isActive: true } } },
    });
  });

  it('AC8: 400 si el fin es anterior al inicio', async () => {
    const { service } = setup();

    expect(
      await badRequestOf(
        service.getReport(query({ from: '2026-11-22', to: '2026-11-21' }), NOW),
      ),
    ).toMatchObject({
      field: 'to',
      message: [DELINQUENCY_MESSAGES.endBeforeStart],
    });
  });

  it('AC8: 400 si el rango pasa de 366 días; con 366 sí responde', async () => {
    const { service } = setup();

    expect(
      await badRequestOf(
        service.getReport(query({ from: '2025-01-01', to: '2026-01-03' }), NOW),
      ),
    ).toMatchObject({
      field: 'to',
      message: [DELINQUENCY_MESSAGES.rangeTooLong],
    });
    await expect(
      service.getReport(query({ from: '2025-01-01', to: '2026-01-02' }), NOW),
    ).resolves.toBeDefined();
  });

  it.each(['RESIDENTE', 'SEGURIDAD'] as const)(
    'AC8: %s recibe 403 en el panel',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        'No tienes permiso para esta acción.',
      );
    },
  );

  it('AC8: el Administrador sí consulta el panel', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
