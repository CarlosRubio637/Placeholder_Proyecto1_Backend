import { Prisma } from '@PrismaClient';
import type {
  OverdueUnitRecord,
  OverdueUnitsRepository,
} from './overdue-units.repository.js';
import { OverdueUnitsService } from './overdue-units.service.js';

const NOW = new Date('2026-11-18T16:00:00Z');
const TOWER_B = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';

type FeeFixture = [period: string, amount: string, overdueAt: string | null];

const SEPTEMBER: FeeFixture = ['2026-09', '45.00', '2026-10-11T06:05:00Z'];
const OCTOBER: FeeFixture = ['2026-10', '45.00', '2026-11-10T06:05:00Z'];

function unit(
  code: string,
  fees: FeeFixture[],
  residents: string[] = ['Ana Gómez'],
): OverdueUnitRecord {
  return {
    id: `id-${code}`,
    code,
    tower: { name: `Torre ${code[0]}` },
    residents: residents.map((fullName, index) => ({
      id: `${code}-r${index + 1}`,
      profile: { fullName },
    })),
    fees: fees.map(([period, amount, overdueAt]) => ({
      period,
      amount: new Prisma.Decimal(amount),
      overdueAt: overdueAt ? new Date(overdueAt) : null,
    })),
  };
}

function setup(units: OverdueUnitRecord[], activeUnits: number) {
  const repository = {
    findOverdueUnits: vi.fn().mockResolvedValue(units),
    countActiveUnits: vi.fn().mockResolvedValue(activeUnits),
  };
  const service = new OverdueUnitsService(
    repository as unknown as OverdueUnitsRepository,
  );
  return { service, repository };
}

const query = (extra: {
  towerId?: string;
  search?: string;
  page?: number;
}) => ({
  page: 1,
  pageSize: 20,
  ...extra,
});

const codesOf = (rows: { unitCode: string }[]) =>
  rows.map((row) => row.unitCode);

describe('H4. Reporte de unidades morosas', () => {
  it('AC5: una unidad morosa sale con sus cuotas Moroso, su monto, la fecha Moroso desde más antigua y los días en mora', async () => {
    const { service } = setup(
      [unit('B-203', [OCTOBER, SEPTEMBER], ['Sofía Castillo', 'Daniel Ramos'])],
      5,
    );

    const report = await service.getReport(query({}), NOW);

    expect(report.data).toEqual([
      {
        unitId: 'id-B-203',
        unitCode: 'B-203',
        towerName: 'Torre B',
        residents: ['Daniel Ramos', 'Sofía Castillo'],
        overdueFees: 2,
        overdueAmount: 90,
        overdueSince: '2026-10-11',
        daysOverdue: 38,
      },
    ]);
  });

  it('AC5: Moroso desde y los días en mora usan la fecha de El Salvador, no la de UTC', async () => {
    const { service } = setup(
      [unit('C-304', [['2026-09', '45.00', '2026-10-12T05:30:00Z']])],
      5,
    );

    const [row] = (await service.getReport(query({}), NOW)).data;

    expect(row.overdueSince).toBe('2026-10-11');
    expect(row.daysOverdue).toBe(38);
  });

  it('AC5: el porcentaje es unidades morosas entre unidades activas, por 100, con un decimal', async () => {
    const { service } = setup([unit('A-102', [OCTOBER])], 3);

    const { summary } = await service.getReport(query({}), NOW);

    expect(summary).toEqual({
      overdueUnits: 1,
      overdueActiveUnits: 1,
      overdueAmount: 45,
      activeUnits: 3,
      overduePercent: 33.3,
    });
  });

  it('AC5: una unidad morosa sin residentes activos sale en la tabla y en el monto, pero el porcentaje no pasa de 100', async () => {
    const { service } = setup(
      [
        unit('A-102', [OCTOBER]),
        unit('C-404', [SEPTEMBER], []),
        unit('B-203', [SEPTEMBER, OCTOBER]),
      ],
      2,
    );

    const report = await service.getReport(query({}), NOW);

    expect(report.summary).toEqual({
      overdueUnits: 3,
      overdueActiveUnits: 2,
      overdueAmount: 180,
      activeUnits: 2,
      overduePercent: 100,
    });
    expect(report.data.find((row) => row.unitCode === 'C-404')).toMatchObject({
      residents: [],
      overdueAmount: 45,
    });
  });

  it('AC5: sin unidades activas el porcentaje es 0', async () => {
    const { service } = setup([unit('C-404', [SEPTEMBER], [])], 0);

    const { summary } = await service.getReport(query({}), NOW);

    expect(summary.overduePercent).toBe(0);
  });

  it('AC5: el resumen no cambia con la búsqueda, la tabla sí', async () => {
    const { service } = setup(
      [unit('A-102', [OCTOBER]), unit('B-203', [SEPTEMBER, OCTOBER])],
      5,
    );

    const report = await service.getReport(query({ search: 'b-2' }), NOW);

    expect(codesOf(report.data)).toEqual(['B-203']);
    expect(report.total).toBe(1);
    expect(report.summary).toEqual({
      overdueUnits: 2,
      overdueActiveUnits: 2,
      overdueAmount: 135,
      activeUnits: 5,
      overduePercent: 40,
    });
  });

  it('AC6: los montos suman los centavos exactos de las cuotas Moroso, como el estado de cuenta', async () => {
    const { service } = setup(
      [
        unit('A-102', [
          ['2026-09', '45.10', SEPTEMBER[2]],
          ['2026-10', '45.20', OCTOBER[2]],
        ]),
        unit('B-203', [['2026-10', '45.35', OCTOBER[2]]]),
      ],
      5,
    );

    const report = await service.getReport(query({}), NOW);

    expect(report.data.map((row) => row.overdueAmount)).toEqual([90.3, 45.35]);
    expect(report.summary.overdueAmount).toBe(135.65);
  });

  it('AC2: ordena por Moroso desde, del más antiguo al más reciente, y en empate por código', async () => {
    const { service } = setup(
      [
        unit('A-102', [OCTOBER]),
        unit('C-304', [SEPTEMBER]),
        unit('B-203', [['2026-09', '45.00', '2026-10-11T20:00:00Z']]),
      ],
      5,
    );

    const { data } = await service.getReport(query({}), NOW);

    expect(codesOf(data)).toEqual(['B-203', 'C-304', 'A-102']);
  });

  it('AC2: devuelve 20 filas por página y el total de unidades morosas', async () => {
    const units = Array.from({ length: 21 }, (_, index) =>
      unit(`A-${101 + index}`, [SEPTEMBER]),
    );
    const { service } = setup(units, 21);

    const first = await service.getReport(query({}), NOW);
    const second = await service.getReport(query({ page: 2 }), NOW);

    expect(first.data).toHaveLength(20);
    expect(codesOf(second.data)).toEqual(['A-121']);
    expect(second).toMatchObject({ total: 21, page: 2, pageSize: 20 });
  });

  it.each([
    ['a-1', ['A-101', 'A-102']],
    ['01', ['A-101', 'B-101']],
  ])(
    'AC3: la búsqueda "%s" encuentra el texto en cualquier parte del código, sin distinguir mayúsculas',
    async (search, expected) => {
      const { service } = setup(
        [
          unit('A-101', [SEPTEMBER]),
          unit('A-102', [SEPTEMBER]),
          unit('B-101', [SEPTEMBER]),
        ],
        5,
      );

      const { data } = await service.getReport(query({ search }), NOW);

      expect(codesOf(data)).toEqual(expected);
    },
  );

  it('AC3: el filtro de torre limita la tabla y también el resumen a esa torre', async () => {
    const { service, repository } = setup([], 2);

    await service.getReport(query({ towerId: TOWER_B }), NOW);

    expect(repository.findOverdueUnits).toHaveBeenCalledWith(TOWER_B);
    expect(repository.countActiveUnits).toHaveBeenCalledWith(TOWER_B);
  });
});

describe('Datos inconsistentes del reporte de morosidad', () => {
  it('una cuota Moroso sin overdueAt es un error con la unidad y el periodo', async () => {
    const { service } = setup(
      [unit('B-203', [OCTOBER, ['2026-09', '45.00', null]])],
      5,
    );

    await expect(service.getReport(query({}), NOW)).rejects.toThrow(
      'B-203 tiene la cuota Moroso 2026-09 sin overdueAt',
    );
  });

  it('un residente sin perfil es un error con el residente y la unidad', async () => {
    const record = unit('A-101', [SEPTEMBER]);
    record.residents = [{ id: 'A-101-r1', profile: null }];
    const { service } = setup([record], 5);

    await expect(service.getReport(query({}), NOW)).rejects.toThrow(
      'El residente A-101-r1 de A-101 no tiene perfil',
    );
  });
});
