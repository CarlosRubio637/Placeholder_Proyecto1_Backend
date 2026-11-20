import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { FeeStatus, Prisma, Role } from '@PrismaClient';

const ACTIVE_RESIDENT = { role: Role.RESIDENTE, isActive: true };

const OVERDUE_UNIT_SELECT = {
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
} satisfies Prisma.UnitSelect;

export type OverdueUnitRecord = Prisma.UnitGetPayload<{
  select: typeof OVERDUE_UNIT_SELECT;
}>;

@Injectable()
export class OverdueUnitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOverdueUnits(towerId?: string): Promise<OverdueUnitRecord[]> {
    return this.prisma.unit.findMany({
      where: { towerId, fees: { some: { status: FeeStatus.MOROSO } } },
      select: OVERDUE_UNIT_SELECT,
    });
  }

  countActiveUnits(towerId?: string): Promise<number> {
    return this.prisma.unit.count({
      where: { towerId, residents: { some: ACTIVE_RESIDENT } },
    });
  }
}
