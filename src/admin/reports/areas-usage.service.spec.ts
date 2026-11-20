import { BadRequestException } from '@nestjs/common';
import { toDbDate } from '@Common/time';
import { ReservationStatus } from '@PrismaClient';
import { AREAS_USAGE_MESSAGES } from './areas-usage.constants.js';
import type {
  ActiveArea,
  AreasUsageRepository,
  BlockRow,
  ReservationRow,
} from './areas-usage.repository.js';
import { AreasUsageService } from './areas-usage.service.js';

// Jueves 19 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-19T16:00:00Z');
const TODAY = '2026-11-19';

function setup(data: {
  areas?: ActiveArea[];
  reservations?: ReservationRow[];
  blocks?: BlockRow[];
}) {
  const repository = {
    activeAreas: vi.fn().mockResolvedValue(data.areas ?? []),
    reservations: vi.fn().mockResolvedValue(data.reservations ?? []),
    blocks: vi.fn().mockResolvedValue(data.blocks ?? []),
  };
  const service = new AreasUsageService(
    repository as unknown as AreasUsageRepository,
  );
  return { service, repository };
}

const area = (
  id: string,
  name: string,
  openTime = '08:00',
  closeTime = '22:00',
): ActiveArea => ({ id, name, openTime, closeTime });

const reservation = (
  areaId: string,
  startTime: string,
  endTime: string,
  status: ReservationStatus = ReservationStatus.CONFIRMADA,
): ReservationRow => ({ areaId, startTime, endTime, status });

const block = (areaId: string, start: string, end: string): BlockRow => ({
  areaId,
  startDate: toDbDate(start),
  endDate: toDbDate(end),
});

async function expectBadRequest(promise: Promise<unknown>, message: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({
    field: 'to',
    message: [message],
  });
}

describe('AreasUsageService.resolvePeriod', () => {
  const { service } = setup({});

  it('sin fechas usa el mes actual: del día 1 hasta hoy', () => {
    expect(service.resolvePeriod({}, TODAY)).toEqual({
      from: '2026-11-01',
      to: TODAY,
    });
  });

  it('con solo `to`, empieza el día 1 de ese mes', () => {
    expect(service.resolvePeriod({ to: '2026-10-15' }, TODAY)).toEqual({
      from: '2026-10-01',
      to: '2026-10-15',
    });
  });

  it('acepta una diferencia de 366 días exactos', () => {
    expect(() =>
      service.resolvePeriod({ from: '2025-11-18', to: TODAY }, TODAY),
    ).not.toThrow();
  });

  it('rechaza un fin anterior al inicio (400 en `to`)', async () => {
    await expectBadRequest(
      service.getReport({ from: TODAY, to: '2026-11-18' }, NOW),
      AREAS_USAGE_MESSAGES.endBeforeStart,
    );
  });

  it('rechaza más de 366 días (400 en `to`)', async () => {
    await expectBadRequest(
      service.getReport({ from: '2025-11-17', to: TODAY }, NOW),
      AREAS_USAGE_MESSAGES.rangeTooLong,
    );
  });
});

describe('AreasUsageService.getReport', () => {
  // Del 1 al 10 de noviembre: 10 días.
  const range = { from: '2026-11-01', to: '2026-11-10' };

  it('calcula reservas, horas y ocupación de un área', async () => {
    const { service, repository } = setup({
      areas: [area('a1', 'Salón de eventos')], // 14 h por día
      reservations: [
        reservation('a1', '08:00', '10:00'),
        reservation('a1', '10:00', '12:00'),
        reservation('a1', '12:00', '14:00', ReservationStatus.CANCELADA),
        reservation('a1', '14:00', '16:00', ReservationStatus.CANCELADA_ADMIN),
      ],
      // Toca los días 9 y 10 del periodo: quedan 8 días habilitados.
      blocks: [block('a1', '2026-11-09', '2026-11-15')],
    });

    const report = await service.getReport(range, NOW);

    expect(repository.reservations).toHaveBeenCalledWith(['a1'], range);
    expect(repository.blocks).toHaveBeenCalledWith(['a1'], range);
    expect(report.data).toEqual([
      {
        areaId: 'a1',
        name: 'Salón de eventos',
        confirmed: 2,
        // Las dos cancelaciones (residente y administración) solo informan.
        cancelled: 2,
        reservedHours: 4,
        enabledHours: 8 * 14,
        occupancyPct: 3.6, // 4 / 112 × 100 = 3.57…
      },
    ]);
  });

  it('las canceladas no suman horas reservadas', async () => {
    const { service } = setup({
      areas: [area('a1', 'Piscina')],
      reservations: [
        reservation('a1', '08:00', '09:00', ReservationStatus.CANCELADA),
      ],
    });

    const [row] = (await service.getReport(range, NOW)).data;
    expect(row).toMatchObject({
      confirmed: 0,
      cancelled: 1,
      reservedHours: 0,
      occupancyPct: 0,
    });
  });

  it('dos bloqueos que se traslapan restan cada día una sola vez', async () => {
    const { service } = setup({
      areas: [area('a1', 'Gimnasio', '05:00', '22:00')], // 17 h por día
      blocks: [
        block('a1', '2026-10-28', '2026-11-03'), // días 1 a 3
        block('a1', '2026-11-02', '2026-11-04'), // días 2 a 4
      ],
    });

    const [row] = (await service.getReport(range, NOW)).data;
    expect(row.enabledHours).toBe(6 * 17);
  });

  it('sin horas habilitadas (todo bloqueado) la ocupación es 0', async () => {
    const { service } = setup({
      areas: [area('a1', 'Asador')],
      reservations: [reservation('a1', '10:00', '12:00')],
      blocks: [block('a1', '2026-10-01', '2026-12-31')],
    });

    const [row] = (await service.getReport(range, NOW)).data;
    expect(row).toMatchObject({ enabledHours: 0, occupancyPct: 0 });
  });

  it('ordena de mayor a menor ocupación', async () => {
    const day = { from: '2026-11-10', to: '2026-11-10' };
    const { service } = setup({
      areas: [
        area('baja', 'Asador', '10:00', '12:00'),
        area('alta', 'Piscina', '10:00', '12:00'),
      ],
      reservations: [
        reservation('baja', '10:00', '11:00'), // 50 %
        reservation('alta', '10:00', '12:00'), // 100 %
      ],
    });

    const report = await service.getReport(day, NOW);
    expect(report.data.map((row) => row.occupancyPct)).toEqual([100, 50]);
    expect(report.mostUsed).toEqual({ areaId: 'alta', name: 'Piscina' });
    expect(report.leastUsed).toEqual({ areaId: 'baja', name: 'Asador' });
  });

  it('con la misma ocupación, desempata por reservas: más para la más usada, menos para la menos usada', async () => {
    const day = { from: '2026-11-10', to: '2026-11-10' };
    const { service } = setup({
      areas: [
        area('dos', 'Zona B', '10:00', '12:00'),
        area('una', 'Zona A', '10:00', '12:00'),
      ],
      reservations: [
        // Las dos al 50 %: "dos" con dos reservas de 30 min, "una" con una de 1 h.
        reservation('dos', '10:00', '10:30'),
        reservation('dos', '10:30', '11:00'),
        reservation('una', '10:00', '11:00'),
      ],
    });

    const report = await service.getReport(day, NOW);
    expect(report.mostUsed?.areaId).toBe('dos');
    expect(report.leastUsed?.areaId).toBe('una');
  });

  it('si también empatan en reservas, gana la primera por nombre', async () => {
    const day = { from: '2026-11-10', to: '2026-11-10' };
    const { service } = setup({
      areas: [
        area('p', 'Piscina', '10:00', '12:00'),
        area('a', 'Asador', '10:00', '12:00'),
      ],
      reservations: [
        reservation('p', '10:00', '11:00'),
        reservation('a', '10:00', '11:00'),
      ],
    });

    const report = await service.getReport(day, NOW);
    expect(report.data.map((row) => row.name)).toEqual(['Asador', 'Piscina']);
    expect(report.mostUsed?.name).toBe('Asador');
    expect(report.leastUsed?.name).toBe('Asador');
  });

  it('sin reservas confirmadas en el periodo, más y menos usada son null', async () => {
    const { service } = setup({
      areas: [area('a1', 'Piscina'), area('a2', 'Asador')],
      reservations: [
        reservation('a1', '08:00', '09:00', ReservationStatus.CANCELADA),
      ],
    });

    const report = await service.getReport(range, NOW);
    expect(report.data).toHaveLength(2);
    expect(report.mostUsed).toBeNull();
    expect(report.leastUsed).toBeNull();
  });

  it('sin áreas habilitadas responde vacío y no consulta reservas', async () => {
    const { service, repository } = setup({ areas: [] });

    await expect(service.getReport(range, NOW)).resolves.toEqual({
      data: [],
      mostUsed: null,
      leastUsed: null,
    });
    expect(repository.reservations).not.toHaveBeenCalled();
  });
});
