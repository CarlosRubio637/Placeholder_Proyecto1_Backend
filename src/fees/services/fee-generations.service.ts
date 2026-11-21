import { ConflictException, Injectable } from '@nestjs/common';
import { badRequest } from '@Common/validation';
import { toDbDate, todayIso } from '@Common/time';
import { Prisma, type User } from '@PrismaClient';
import {
  defaultConcept,
  isAllowedPeriod,
  isValidDueDate,
  periodLabel,
} from '../billing-period/index.js';
import {
  FeeGenerationDto,
  type FeeGenerationPreviewDto,
  type FeeGenerationsPageDto,
  type FeeGenerationsPageQueryDto,
  type GenerateFeesDto,
} from '../dto/index.js';
import {
  NoActiveUnitsError,
  PeriodAlreadyGeneratedError,
} from '../errors/index.js';
import {
  FEE_MESSAGES,
  periodAlreadyGeneratedMessage,
} from '../fees.constants.js';
import { FeeGenerationRepository } from '../repositories/index.js';

function toHttpError(error: unknown): unknown {
  if (error instanceof NoActiveUnitsError) {
    return new ConflictException(FEE_MESSAGES.noActiveUnits);
  }
  if (error instanceof PeriodAlreadyGeneratedError) {
    return new ConflictException(
      periodAlreadyGeneratedMessage(periodLabel(error.period)),
    );
  }
  return error;
}

@Injectable()
export class FeeGenerationsService {
  constructor(private readonly repository: FeeGenerationRepository) {}

  async preview(
    period: string,
    now = new Date(),
  ): Promise<FeeGenerationPreviewDto> {
    this.assertAllowedPeriod(period, todayIso(now));
    const { activeUnits, alreadyGenerated } =
      await this.repository.countUnitsForPeriod(period);
    return {
      activeUnits,
      alreadyGenerated,
      toCreate: activeUnits - alreadyGenerated,
    };
  }

  async generate(
    admin: User,
    dto: GenerateFeesDto,
    now = new Date(),
  ): Promise<FeeGenerationDto> {
    const today = todayIso(now);
    this.assertAllowedPeriod(dto.period, today);
    if (!isValidDueDate(dto.dueDate, dto.period, today)) {
      throw badRequest('dueDate', FEE_MESSAGES.dueDate);
    }

    try {
      const generation = await this.repository.generate({
        period: dto.period,
        amount: new Prisma.Decimal(dto.amount.toFixed(2)),
        dueDate: toDbDate(dto.dueDate),
        concept: dto.concept ?? defaultConcept(dto.period),
        createdById: admin.id,
      });
      return FeeGenerationDto.fromEntity(generation);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async list(
    query: FeeGenerationsPageQueryDto,
  ): Promise<FeeGenerationsPageDto> {
    const { items, total } = await this.repository.findPage(
      query.page,
      query.pageSize,
    );
    return {
      data: items.map((generation) => FeeGenerationDto.fromEntity(generation)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private assertAllowedPeriod(period: string, today: string): void {
    if (!isAllowedPeriod(period, today)) {
      throw badRequest('period', FEE_MESSAGES.periodWindow);
    }
  }
}
