import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { FeeStatus, type Prisma } from '@PrismaClient';

const CANDIDATE = {
  id: true,
  unitId: true,
  period: true,
  amount: true,
  dueDate: true,
} satisfies Prisma.FeeSelect;

export type FeeTaskCandidate = Prisma.FeeGetPayload<{
  select: typeof CANDIDATE;
}>;

@Injectable()
export class FeeTasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOverdueCandidates(lastDueDate: Date): Promise<FeeTaskCandidate[]> {
    return this.prisma.fee.findMany({
      where: { status: FeeStatus.PENDIENTE, dueDate: { lte: lastDueDate } },
      select: CANDIDATE,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
  }

  async markOverdue(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.fee.updateMany({
      where: { id, status: FeeStatus.PENDIENTE },
      data: { status: FeeStatus.MOROSO, overdueAt: now },
    });
    return count === 1;
  }

  findReminderCandidates(from: Date, to: Date): Promise<FeeTaskCandidate[]> {
    return this.prisma.fee.findMany({
      where: {
        status: FeeStatus.PENDIENTE,
        reminderSentAt: null,
        dueDate: { gte: from, lte: to },
      },
      select: CANDIDATE,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
  }

  async markReminded(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.fee.updateMany({
      where: { id, status: FeeStatus.PENDIENTE, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    return count === 1;
  }
}
