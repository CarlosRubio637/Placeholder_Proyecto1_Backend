import type { PrismaService } from '@Prisma/services';
import { FeeStatus, Role } from '@PrismaClient';
import { OverdueUnitsRepository } from './overdue-units.repository.js';

const TOWER_B = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';
const ACTIVE_RESIDENT = { role: Role.RESIDENTE, isActive: true };
const OVERDUE_UNITS_SELECT = {
  id: true,
  code: true,
  tower: { select: { name: true } },
  residents: {
    where: ACTIVE_RESIDENT,
    select: { id: true, profile: { select: { fullName: true } } },
  },
  fees: {
    where: { status: FeeStatus.MOROSO },
    select: { period: true, amount: true, overdueAt: true },
  },
};

function setup() {
  const unit = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  const repository = new OverdueUnitsRepository({
    unit,
  } as unknown as PrismaService);
  return { repository, unit };
}

describe('H4. Reporte de unidades morosas', () => {
  it('AC6: lee de Fee solo las cuotas Moroso de cada unidad, con su torre y sus residentes activos', async () => {
    const { repository, unit } = setup();

    await repository.findOverdueUnits();

    expect(unit.findMany).toHaveBeenCalledWith({
      where: { fees: { some: { status: FeeStatus.MOROSO } } },
      select: OVERDUE_UNITS_SELECT,
    });
  });

  it('AC5: cuenta como activas las unidades con al menos un residente activo', async () => {
    const { repository, unit } = setup();
    unit.count.mockResolvedValue(5);

    await expect(repository.countActiveUnits()).resolves.toBe(5);
    expect(unit.count).toHaveBeenCalledWith({
      where: { residents: { some: ACTIVE_RESIDENT } },
    });
  });

  it('AC3: con torre, las unidades morosas y las activas son solo las de esa torre', async () => {
    const { repository, unit } = setup();

    await repository.findOverdueUnits(TOWER_B);
    await repository.countActiveUnits(TOWER_B);

    expect(unit.findMany).toHaveBeenCalledWith({
      where: {
        towerId: TOWER_B,
        fees: { some: { status: FeeStatus.MOROSO } },
      },
      select: OVERDUE_UNITS_SELECT,
    });
    expect(unit.count).toHaveBeenCalledWith({
      where: { towerId: TOWER_B, residents: { some: ACTIVE_RESIDENT } },
    });
  });
});
