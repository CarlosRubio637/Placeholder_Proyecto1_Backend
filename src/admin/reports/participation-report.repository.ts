import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { AssemblyStatus, type Prisma } from '@PrismaClient';

/** Instantes: desde `gte` (incluido) hasta `lt` (excluido). */
export type InstantRange = { gte: Date; lt: Date };

/** Las Programadas no tienen datos: solo entran Abiertas y Cerradas. */
export const REPORTED_STATUSES: AssemblyStatus[] = [
  AssemblyStatus.ABIERTA,
  AssemblyStatus.CERRADA,
];

/**
 * Lo que lee el reporte. Solo conteos: VoteParticipation dice qué unidad votó,
 * nunca qué opción (eso vive en Ballot, que este reporte no toca).
 */
const ASSEMBLY_SELECT = {
  id: true,
  title: true,
  status: true,
  openedAt: true,
  _count: { select: { eligibleUnits: true } },
  topics: {
    orderBy: { order: 'asc' },
    select: {
      question: true,
      _count: { select: { voteParticipations: true } },
    },
  },
} satisfies Prisma.AssemblySelect;

export type AssemblyRow = Prisma.AssemblyGetPayload<{
  select: typeof ASSEMBLY_SELECT;
}>;

/** Una asamblea concreta, o las abiertas en el periodo. */
export type AssemblyFilter =
  { assemblyId: string } | { openedAt: InstantRange };

/**
 * Consultas del reporte de participación en votaciones (H35). Lee Assembly,
 * AssemblyTopic y AssemblyEligibleUnit (H22) y VoteParticipation (H23), así
 * las cifras coinciden con el Módulo 6.
 */
@Injectable()
export class ParticipationReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assemblies(
    filter: AssemblyFilter,
    page: number,
    pageSize: number,
  ): Promise<{ rows: AssemblyRow[]; total: number }> {
    const where: Prisma.AssemblyWhereInput = {
      status: { in: REPORTED_STATUSES },
      ...('assemblyId' in filter
        ? { id: filter.assemblyId }
        : { openedAt: filter.openedAt }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.assembly.findMany({
        where,
        select: ASSEMBLY_SELECT,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.assembly.count({ where }),
    ]);
    return { rows, total };
  }
}
