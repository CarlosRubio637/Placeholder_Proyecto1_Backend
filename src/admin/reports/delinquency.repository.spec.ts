import type { PrismaService } from '@Prisma/services';
import { toDbDate } from '@Common/time';
import { FeeStatus, Prisma, Role } from '@PrismaClient';
import { DelinquencyRepository } from './delinquency.repository.js';

const RANGE = { from: '2025-11-07', to: '2026-11-07' };
const DUE_DATE = { gte: toDbDate(RANGE.from), lte: toDbDate(RANGE.to) };
const UNPAID = { in: [FeeStatus.PENDIENTE, FeeStatus.MOROSO] };
const ACTIVE_RESIDENT = {
  some: { role: Role.RESIDENTE, isActive: true },
};

function setup() {
  const fee = {
    aggregate: vi.fn(),
    groupBy: vi.fn().mockResolvedValue([]),
  };
  const unit = {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const repository = new DelinquencyRepository({
    fee,
    unit,
  } as unknown as PrismaService);
  return { repository, fee, unit };
}

describe('consultas del panel de morosidad', () => {
  it('monto adeudado: suma Pendiente y Moroso del rango (sin Pagado)', async () => {
    const { repository, fee } = setup();
    fee.aggregate.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal('1665.50') },
    });

    await expect(repository.owedAmount(RANGE)).resolves.toBe(1665.5);
    expect(fee.aggregate).toHaveBeenCalledWith({
      where: { status: UNPAID, dueDate: DUE_DATE },
      _sum: { amount: true },
    });
  });

  it('monto adeudado: 0 si no hay cuotas en el rango', async () => {
    const { repository, fee } = setup();
    fee.aggregate.mockResolvedValue({ _sum: { amount: null } });

    await expect(repository.owedAmount(RANGE)).resolves.toBe(0);
  });

  it('unidades morosas: agrupa por unidad solo las cuotas Moroso del rango', async () => {
    const { repository, fee } = setup();
    fee.groupBy.mockResolvedValue([{ unitId: 'u1' }, { unitId: 'u2' }]);

    await expect(repository.overdueUnitIds(RANGE)).resolves.toEqual([
      'u1',
      'u2',
    ]);
    expect(fee.groupBy).toHaveBeenCalledWith({
      by: ['unitId'],
      where: { status: FeeStatus.MOROSO, dueDate: DUE_DATE },
    });
  });

  it('unidades activas: al menos un Residente activo, de todo el condominio', async () => {
    const { repository, unit } = setup();
    unit.count.mockResolvedValue(30);

    await expect(repository.countActiveUnits()).resolves.toBe(30);
    expect(unit.count).toHaveBeenCalledWith({
      where: { residents: ACTIVE_RESIDENT },
    });
  });

  it('morosas activas: la misma regla, solo entre las unidades indicadas', async () => {
    const { repository, unit } = setup();
    unit.count.mockResolvedValue(3);

    await expect(
      repository.countActiveUnits(['u1', 'u2', 'c404']),
    ).resolves.toBe(3);
    expect(unit.count).toHaveBeenCalledWith({
      where: {
        id: { in: ['u1', 'u2', 'c404'] },
        residents: ACTIVE_RESIDENT,
      },
    });
  });

  it('deuda por unidad: sin unidades no consulta', async () => {
    const { repository, fee, unit } = setup();

    await expect(repository.unitDebts([], RANGE)).resolves.toEqual([]);
    expect(fee.groupBy).not.toHaveBeenCalled();
    expect(unit.findMany).not.toHaveBeenCalled();
  });

  it('deuda por unidad: monto del rango y antigüedad de toda la deuda impaga', async () => {
    const { repository, fee, unit } = setup();
    fee.groupBy
      // Monto del rango.
      .mockResolvedValueOnce([
        { unitId: 'u1', _sum: { amount: new Prisma.Decimal('135.00') } },
        { unitId: 'u2', _sum: { amount: new Prisma.Decimal('45.00') } },
      ])
      // Vencimiento más antiguo, sin rango.
      .mockResolvedValueOnce([
        { unitId: 'u1', _min: { dueDate: toDbDate('2025-10-10') } },
        { unitId: 'u2', _min: { dueDate: toDbDate('2026-10-10') } },
      ]);
    unit.findMany.mockResolvedValue([
      { id: 'u1', code: 'A-101' },
      { id: 'u2', code: 'C-404' },
    ]);

    await expect(repository.unitDebts(['u1', 'u2'], RANGE)).resolves.toEqual([
      {
        unitCode: 'A-101',
        owedAmount: 135,
        oldestDueDate: toDbDate('2025-10-10'),
      },
      {
        unitCode: 'C-404',
        owedAmount: 45,
        oldestDueDate: toDbDate('2026-10-10'),
      },
    ]);

    expect(fee.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['unitId'],
      where: {
        unitId: { in: ['u1', 'u2'] },
        status: UNPAID,
        dueDate: DUE_DATE,
      },
      _sum: { amount: true },
    });
    // Sin dueDate: la antigüedad no depende del filtro.
    expect(fee.groupBy).toHaveBeenNthCalledWith(2, {
      by: ['unitId'],
      where: { unitId: { in: ['u1', 'u2'] }, status: UNPAID },
      _min: { dueDate: true },
    });
    expect(unit.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] } },
      select: { id: true, code: true },
    });
  });

  it('deuda por unidad: descarta unidades sin código o sin vencimiento', async () => {
    const { repository, fee, unit } = setup();
    fee.groupBy
      .mockResolvedValueOnce([
        { unitId: 'u1', _sum: { amount: new Prisma.Decimal('45.00') } },
        { unitId: 'u2', _sum: { amount: new Prisma.Decimal('45.00') } },
      ])
      .mockResolvedValueOnce([
        { unitId: 'u1', _min: { dueDate: toDbDate('2026-10-10') } },
      ]);
    unit.findMany.mockResolvedValue([{ id: 'u2', code: 'B-202' }]);

    await expect(repository.unitDebts(['u1', 'u2'], RANGE)).resolves.toEqual(
      [],
    );
  });
});
