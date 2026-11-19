import { Injectable, NotFoundException } from '@nestjs/common';
import { fromDbDate } from '@Common/time';
import type { User } from '@PrismaClient';
import type {
  AccountStatementDto,
  AdminUnitDto,
  RegistrationCodeDto,
  StatementQueryDto,
} from '../dto/index.js';
import { UnitNotFoundError } from '../errors/index.js';
import { STATEMENT_MESSAGES } from '../payments.constants.js';
import { PaymentsRepository } from '../repositories/index.js';

/** Estado de cuenta de la unidad y su administración (H2). */
@Injectable()
export class AccountStatementService {
  constructor(private readonly repository: PaymentsRepository) {}

  /**
   * Estado de cuenta de una unidad. El Residente solo llega con su propia
   * unidad (la toma el controlador del token); el Administrador, con cualquiera.
   */
  async statement(
    unitId: string,
    query: StatementQueryDto,
  ): Promise<AccountStatementDto> {
    const unit = await this.repository.findUnit(unitId);
    if (!unit) {
      throw new NotFoundException(STATEMENT_MESSAGES.unitNotFound);
    }
    const result = await this.repository.statement({
      unitId: unit.id,
      year: query.year,
      status: query.status,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const years = [
      ...new Set(result.periods.map((p) => Number(p.slice(0, 4)))),
    ].sort((a, b) => b - a);
    return {
      unit: { id: unit.id, code: unit.code },
      summary: {
        pendingBalance: result.pendingBalance?.toNumber() ?? 0,
        overdueCount: result.overdueCount,
        nextDueDate: result.nextDueDate ? fromDbDate(result.nextDueDate) : null,
      },
      years,
      data: result.rows.map((fee) => ({
        id: fee.id,
        period: fee.period,
        concept: fee.concept,
        amount: fee.amount.toNumber(),
        dueDate: fromDbDate(fee.dueDate),
        status: fee.status,
        paidAt: fee.paidAt,
      })),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async adminUnit(unitId: string): Promise<AdminUnitDto> {
    const unit = await this.repository.findUnit(unitId);
    if (!unit) {
      throw new NotFoundException(STATEMENT_MESSAGES.unitNotFound);
    }
    return {
      id: unit.id,
      code: unit.code,
      tower: { id: unit.tower.id, name: unit.tower.name },
      registrationCode: unit.registrationCode,
      registrationCodeUpdatedAt: unit.registrationCodeUpdatedAt,
      residents: unit.residents.map((r) => ({
        fullName: r.profile?.fullName ?? r.email,
        email: r.email,
      })),
    };
  }

  async regenerateCode(
    admin: User,
    unitId: string,
    now = new Date(),
  ): Promise<RegistrationCodeDto> {
    try {
      const updated = await this.repository.regenerateRegistrationCode(
        unitId,
        admin.id,
        now,
      );
      return {
        registrationCode: updated.registrationCode,
        registrationCodeUpdatedAt: updated.registrationCodeUpdatedAt ?? now,
      };
    } catch (error) {
      if (error instanceof UnitNotFoundError) {
        throw new NotFoundException(STATEMENT_MESSAGES.unitNotFound);
      }
      throw error;
    }
  }
}
