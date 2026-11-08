import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { toDbDate } from '@Common/time';
import { FeeStatus, Role } from '@PrismaClient';

/** Rango de vencimiento, ambos extremos incluidos, "AAAA-MM-DD". */
export type DueDateRange = { from: string; to: string };

export type UnitDebt = {
  unitCode: string;
  /** Suma de sus cuotas Pendiente y Moroso del rango. */
  owedAmount: number;
  /**
   * Vencimiento de su cuota impaga más antigua, sin importar el rango: la
   * antigüedad es de la deuda de la unidad, no del filtro.
   */
  oldestDueDate: Date;
};

/** Cuotas que todavía se deben. Las Pagado no cuentan. */
const UNPAID = [FeeStatus.PENDIENTE, FeeStatus.MOROSO];

/**
 * Consultas del panel de morosidad (H32). Lee las cuotas del Módulo 1 (Fee,
 * H3), así las cifras coinciden con los registros de H2 y H4.
 */
@Injectable()
export class DelinquencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private dueDate(range: DueDateRange) {
    return { gte: toDbDate(range.from), lte: toDbDate(range.to) };
  }

  /** Suma de las cuotas Pendiente y Moroso del rango, de todas las unidades. */
  async owedAmount(range: DueDateRange): Promise<number> {
    const result = await this.prisma.fee.aggregate({
      where: { status: { in: UNPAID }, dueDate: this.dueDate(range) },
      _sum: { amount: true },
    });
    return result._sum.amount?.toNumber() ?? 0;
  }

  /** Unidades con al menos una cuota Moroso en el rango. */
  async overdueUnitIds(range: DueDateRange): Promise<string[]> {
    const groups = await this.prisma.fee.groupBy({
      by: ['unitId'],
      where: { status: FeeStatus.MOROSO, dueDate: this.dueDate(range) },
    });
    return groups.map((group) => group.unitId);
  }

  /**
   * Unidades con al menos un residente activo. Con `unitIds`, cuenta solo las
   * activas de esa lista (por ejemplo, las morosas), con la misma regla.
   */
  countActiveUnits(unitIds?: string[]): Promise<number> {
    return this.prisma.unit.count({
      where: {
        ...(unitIds ? { id: { in: unitIds } } : {}),
        residents: { some: { role: Role.RESIDENTE, isActive: true } },
      },
    });
  }

  /**
   * Deuda de cada unidad indicada: el monto es el del rango; el vencimiento
   * más antiguo, el de toda su deuda impaga.
   */
  async unitDebts(unitIds: string[], range: DueDateRange): Promise<UnitDebt[]> {
    if (unitIds.length === 0) return [];

    const [amounts, oldest, units] = await Promise.all([
      this.prisma.fee.groupBy({
        by: ['unitId'],
        where: {
          unitId: { in: unitIds },
          status: { in: UNPAID },
          dueDate: this.dueDate(range),
        },
        _sum: { amount: true },
      }),
      this.prisma.fee.groupBy({
        by: ['unitId'],
        where: { unitId: { in: unitIds }, status: { in: UNPAID } },
        _min: { dueDate: true },
      }),
      this.prisma.unit.findMany({
        where: { id: { in: unitIds } },
        select: { id: true, code: true },
      }),
    ]);

    const codes = new Map(units.map((unit) => [unit.id, unit.code]));
    const oldestDueDates = new Map(
      oldest.map((group) => [group.unitId, group._min.dueDate]),
    );
    return amounts.flatMap((group) => {
      const unitCode = codes.get(group.unitId);
      const oldestDueDate = oldestDueDates.get(group.unitId);
      if (!unitCode || !oldestDueDate) return [];
      return [
        {
          unitCode,
          owedAmount: group._sum.amount?.toNumber() ?? 0,
          oldestDueDate,
        },
      ];
    });
  }
}
