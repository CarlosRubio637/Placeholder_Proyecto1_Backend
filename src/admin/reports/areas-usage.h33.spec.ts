// El handler del controlador se pasa sin llamarlo: RolesGuard lee su metadata
// @Roles.
/* oxlint-disable typescript/unbound-method */
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import { toDbDate } from '@Common/time';
import type { PrismaService } from '@Prisma/services';
import type { ReservationStatus, Role } from '@PrismaClient';
import { AreasUsageRepository } from './areas-usage.repository.js';
import { AreasUsageService } from './areas-usage.service.js';
import { ReportsController } from './reports.controller.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
// 10 días: del 1 al 10 de noviembre.
const PERIOD = { from: '2026-11-01', to: '2026-11-10' };

type Area = { id: string; name: string; openTime: string; closeTime: string };
type Row = {
  areaId: string;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
};
type Block = { areaId: string; startDate: Date; endDate: Date };

const area = (
  id: string,
  name: string,
  openTime = '08:00',
  closeTime = '20:00',
): Area => ({
  id,
  name,
  openTime,
  closeTime,
});

const reservation = (
  areaId: string,
  startTime: string,
  endTime: string,
  status: ReservationStatus = 'CONFIRMADA',
): Row => ({ areaId, status, startTime, endTime });

/** Servicio y repositorio reales sobre un Prisma simulado. */
function setup(data: {
  areas: Area[];
  reservations?: Row[];
  blocks?: Block[];
}) {
  const prisma = {
    commonArea: { findMany: vi.fn().mockResolvedValue(data.areas) },
    reservation: {
      findMany: vi.fn().mockResolvedValue(data.reservations ?? []),
    },
    areaBlock: { findMany: vi.fn().mockResolvedValue(data.blocks ?? []) },
  };
  const service = new AreasUsageService(
    new AreasUsageRepository(prisma as unknown as PrismaService),
  );
  return { prisma, service };
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => ReportsController.prototype.getAreas,
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H33. Reporte de uso de áreas comunes', () => {
  it('AC2: sin fechas, el periodo es el mes actual hasta hoy', async () => {
    const { prisma, service } = setup({ areas: [area('a-1', 'Piscina')] });

    await service.getReport({}, NOW);

    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          areaId: { in: ['a-1'] },
          date: { gte: toDbDate('2026-11-01'), lte: toDbDate('2026-11-22') },
        },
      }),
    );
  });

  it('AC3: sin reservas Confirmadas en el periodo no hay más ni menos usada (estado vacío)', async () => {
    const { service } = setup({
      areas: [area('a-1', 'Piscina')],
      reservations: [reservation('a-1', '08:00', '10:00', 'CANCELADA')],
    });

    const report = await service.getReport(PERIOD, NOW);

    expect(report.mostUsed).toBeNull();
    expect(report.leastUsed).toBeNull();
  });

  it('AC5: las horas reservadas suman solo las Confirmadas; las canceladas se cuentan aparte', async () => {
    const { service } = setup({
      areas: [area('a-1', 'Piscina')],
      reservations: [
        reservation('a-1', '08:00', '10:00'),
        reservation('a-1', '14:00', '15:00'),
        reservation('a-1', '10:00', '12:00', 'CANCELADA'),
        reservation('a-1', '16:00', '18:00', 'CANCELADA_ADMIN'),
      ],
    });

    const [row] = (await service.getReport(PERIOD, NOW)).data;

    expect(row).toMatchObject({ confirmed: 2, cancelled: 2, reservedHours: 3 });
  });

  it('AC5: las horas habilitadas son las del horario por cada día del periodo, sin los días bloqueados', async () => {
    const { service } = setup({
      areas: [area('a-1', 'Piscina')],
      blocks: [
        {
          areaId: 'a-1',
          startDate: toDbDate('2026-10-30'),
          endDate: toDbDate('2026-11-02'),
        },
      ],
    });

    const [row] = (await service.getReport(PERIOD, NOW)).data;

    // 10 días − 2 bloqueados dentro del periodo = 8 días de 12 horas.
    expect(row.enabledHours).toBe(96);
  });

  it('AC5: la ocupación es reservadas entre habilitadas, por 100, con un decimal', async () => {
    const { service } = setup({
      areas: [area('a-1', 'Piscina')],
      reservations: [
        reservation('a-1', '08:00', '10:00'),
        reservation('a-1', '10:00', '12:00'),
      ],
    });

    const [row] = (await service.getReport(PERIOD, NOW)).data;

    // 4 / 120 × 100 = 3.33…
    expect(row).toMatchObject({
      reservedHours: 4,
      enabledHours: 120,
      occupancyPct: 3.3,
    });
  });

  it('AC5: sin horas habilitadas la ocupación es 0', async () => {
    const { service } = setup({
      areas: [area('a-1', 'Piscina')],
      blocks: [
        {
          areaId: 'a-1',
          startDate: toDbDate('2026-11-01'),
          endDate: toDbDate('2026-11-10'),
        },
      ],
    });

    const [row] = (await service.getReport(PERIOD, NOW)).data;

    expect(row).toMatchObject({ enabledHours: 0, occupancyPct: 0 });
  });

  it('AC6: la más usada tiene la mayor ocupación y la menos usada la menor', async () => {
    const { service } = setup({
      areas: [
        area('a-1', 'Asador'),
        area('a-2', 'Piscina'),
        area('a-3', 'Gimnasio'),
      ],
      reservations: [
        reservation('a-2', '08:00', '12:00'),
        reservation('a-3', '08:00', '10:00'),
        reservation('a-1', '08:00', '09:00'),
      ],
    });

    const report = await service.getReport(PERIOD, NOW);

    expect(report.mostUsed?.name).toBe('Piscina');
    expect(report.leastUsed?.name).toBe('Asador');
    expect(report.data.map((row) => row.name)).toEqual([
      'Piscina',
      'Gimnasio',
      'Asador',
    ]);
  });

  it('AC6: en empate de ocupación desempata por reservas y después por nombre', async () => {
    const { service } = setup({
      areas: [
        area('a-1', 'Salón'),
        area('a-2', 'Gimnasio'),
        area('a-3', 'Asador'),
      ],
      reservations: [
        // Las tres con 2 horas: Salón con 2 reservas, Gimnasio y Asador con 1.
        reservation('a-1', '08:00', '09:00'),
        reservation('a-1', '09:00', '10:00'),
        reservation('a-2', '08:00', '10:00'),
        reservation('a-3', '08:00', '10:00'),
      ],
    });

    const report = await service.getReport(PERIOD, NOW);

    expect(report.mostUsed?.name).toBe('Salón');
    // Menos usada: menos reservas y, en empate, la primera por nombre.
    expect(report.leastUsed?.name).toBe('Asador');
  });

  it('AC6: las áreas deshabilitadas no entran al reporte', async () => {
    const { prisma, service } = setup({ areas: [area('a-1', 'Piscina')] });

    await service.getReport(PERIOD, NOW);

    expect(prisma.commonArea.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true, openTime: true, closeTime: true },
    });
  });

  it('AC7: las reservas salen del Módulo 2 por fecha de la reserva, en cualquier estado', async () => {
    const { prisma, service } = setup({ areas: [area('a-1', 'Piscina')] });

    await service.getReport(PERIOD, NOW);

    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: {
        areaId: { in: ['a-1'] },
        date: { gte: toDbDate('2026-11-01'), lte: toDbDate('2026-11-10') },
      },
      select: { areaId: true, status: true, startTime: true, endTime: true },
    });
  });

  it.each(['RESIDENTE', 'SEGURIDAD'] as const)(
    'AC8: %s recibe 403 en el reporte',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        'No tienes permiso para esta acción.',
      );
    },
  );

  it('AC8: el Administrador sí consulta el reporte', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
