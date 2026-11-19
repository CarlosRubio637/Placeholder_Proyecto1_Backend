import { Injectable } from '@nestjs/common';
import { todayIso, toDbDate } from '@Common/time';
import { Prisma } from '@PrismaClient';
import type { OverdueUnitsQueryDto } from './dto/overdue-units-query.dto.js';
import type {
  OverdueUnitDto,
  OverdueUnitsReportDto,
} from './dto/overdue-units-response.dto.js';
import {
  OverdueUnitsRepository,
  type OverdueUnitRecord,
} from './overdue-units.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sumAmounts(fees: { amount: Prisma.Decimal }[]): Prisma.Decimal {
  return fees.reduce((sum, fee) => sum.plus(fee.amount), new Prisma.Decimal(0));
}

function earliestOverdueAt(unit: OverdueUnitRecord): Date {
  const times = unit.fees.map((fee) => {
    if (!fee.overdueAt) {
      throw new Error(
        `${unit.code} tiene la cuota Moroso ${fee.period} sin overdueAt`,
      );
    }
    return fee.overdueAt.getTime();
  });
  return new Date(Math.min(...times));
}

function residentNames(unit: OverdueUnitRecord): string[] {
  return unit.residents
    .map((resident) => {
      if (!resident.profile) {
        throw new Error(
          `El residente ${resident.id} de ${unit.code} no tiene perfil`,
        );
      }
      return resident.profile.fullName;
    })
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (toDbDate(toIso).getTime() - toDbDate(fromIso).getTime()) / DAY_MS,
  );
}

function percentWithOneDecimal(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function toRow(unit: OverdueUnitRecord, today: string): OverdueUnitDto {
  const overdueSince = todayIso(earliestOverdueAt(unit));
  return {
    unitId: unit.id,
    unitCode: unit.code,
    towerName: unit.tower.name,
    residents: residentNames(unit),
    overdueFees: unit.fees.length,
    overdueAmount: sumAmounts(unit.fees).toNumber(),
    overdueSince,
    daysOverdue: Math.max(0, daysBetween(overdueSince, today)),
  };
}

@Injectable()
export class OverdueUnitsService {
  constructor(private readonly repository: OverdueUnitsRepository) {}

  async getReport(
    query: OverdueUnitsQueryDto,
    now = new Date(),
  ): Promise<OverdueUnitsReportDto> {
    const [units, activeUnits] = await Promise.all([
      this.repository.findOverdueUnits(query.towerId),
      this.repository.countActiveUnits(query.towerId),
    ]);

    const today = todayIso(now);
    const rows = units
      .map((unit) => toRow(unit, today))
      .sort(
        (a, b) =>
          compareText(a.overdueSince, b.overdueSince) ||
          compareText(a.unitCode, b.unitCode),
      );
    const search = query.search?.toLowerCase();
    const matching = search
      ? rows.filter((row) => row.unitCode.toLowerCase().includes(search))
      : rows;
    const overdueActiveUnits = units.filter(
      (unit) => unit.residents.length > 0,
    ).length;
    const start = (query.page - 1) * query.pageSize;

    return {
      summary: {
        overdueUnits: units.length,
        overdueActiveUnits,
        overdueAmount: sumAmounts(
          units.flatMap((unit) => unit.fees),
        ).toNumber(),
        activeUnits,
        overduePercent: percentWithOneDecimal(overdueActiveUnits, activeUnits),
      },
      data: matching.slice(start, start + query.pageSize),
      total: matching.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
