import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Role, type Prisma } from '@PrismaClient';
import {
  NoActiveUnitsError,
  PeriodAlreadyGeneratedError,
} from '../errors/index.js';

const ACTIVE_UNIT = {
  residents: { some: { role: Role.RESIDENTE, isActive: true } },
} satisfies Prisma.UnitWhereInput;

const WITH_AUTHOR = {
  createdBy: {
    select: { id: true, email: true, profile: { select: { fullName: true } } },
  },
} satisfies Prisma.FeeGenerationInclude;

export type FeeGenerationWithAuthor = Prisma.FeeGenerationGetPayload<{
  include: typeof WITH_AUTHOR;
}>;

export interface GenerateFeesData {
  period: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  concept: string;
  createdById: string;
}

@Injectable()
export class FeeGenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countUnitsForPeriod(
    period: string,
  ): Promise<{ activeUnits: number; alreadyGenerated: number }> {
    const [activeUnits, alreadyGenerated] = await Promise.all([
      this.prisma.unit.count({ where: ACTIVE_UNIT }),
      this.prisma.unit.count({
        where: { ...ACTIVE_UNIT, fees: { some: { period } } },
      }),
    ]);
    return { activeUnits, alreadyGenerated };
  }

  generate(data: GenerateFeesData): Promise<FeeGenerationWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      const units = await tx.unit.findMany({
        where: ACTIVE_UNIT,
        select: { id: true },
      });
      if (units.length === 0) {
        throw new NoActiveUnitsError();
      }

      const generation = await tx.feeGeneration.create({
        data: { ...data, createdCount: 0, skippedCount: 0 },
      });

      const { count } = await tx.fee.createMany({
        data: units.map((unit) => ({
          unitId: unit.id,
          generationId: generation.id,
          period: data.period,
          concept: data.concept,
          amount: data.amount,
          dueDate: data.dueDate,
        })),
        skipDuplicates: true,
      });
      if (count === 0) {
        throw new PeriodAlreadyGeneratedError(data.period);
      }

      return tx.feeGeneration.update({
        where: { id: generation.id },
        data: { createdCount: count, skippedCount: units.length - count },
        include: WITH_AUTHOR,
      });
    });
  }

  async findPage(
    page: number,
    pageSize: number,
  ): Promise<{ items: FeeGenerationWithAuthor[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.feeGeneration.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: WITH_AUTHOR,
      }),
      this.prisma.feeGeneration.count(),
    ]);
    return { items, total };
  }
}
