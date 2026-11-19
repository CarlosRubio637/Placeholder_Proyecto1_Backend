import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ClosedAssembliesQueryDto,
  ParticipationQueryDto,
} from './dto/index.js';
import {
  computeTopicResult,
  pct,
  type ComputedTopicResult,
  type OptionCount,
} from './results.utils.js';

const MSG_ASSEMBLY_NOT_FOUND = 'La asamblea no existe.';
const MSG_TOPIC_NOT_FOUND = 'El tema no existe.';

/**
 * Resultado auditable de la asamblea (H24).
 *
 * Los conteos por opción solo se devuelven con la asamblea Cerrada, aunque
 * quien pregunte sea el Administrador: mientras está Abierta se responde solo
 * la participación. El resultado de una Cerrada sale del TopicResult guardado
 * al cierre, que no se modifica.
 */
@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async getResult(id: string) {
    const assembly = await this.prisma.assembly.findUnique({
      where: { id },
      include: {
        _count: { select: { eligibleUnits: true } },
        topics: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              select: { id: true, text: true },
            },
            result: true,
            _count: { select: { voteParticipations: true } },
          },
        },
      },
    });
    if (!assembly) throw new NotFoundException(MSG_ASSEMBLY_NOT_FOUND);

    const closed = assembly.status === 'CERRADA';
    // En Programada todavía no hay unidades habilitadas (se fijan al abrir).
    const liveEligible =
      assembly.status === 'PROGRAMADA' ? 0 : assembly._count.eligibleUnits;

    const topics = [];
    for (const topic of assembly.topics) {
      if (!closed) {
        const votedUnits = topic._count.voteParticipations;
        topics.push({
          id: topic.id,
          question: topic.question,
          eligibleUnits: liveEligible,
          votedUnits,
          participationPct: pct(votedUnits, liveEligible),
          totalVotes: null,
          options: topic.options.map((option) => ({
            id: option.id,
            text: option.text,
            votes: null,
            pct: null,
          })),
          winnerOptionId: null,
          isTie: false,
        });
        continue;
      }

      const stored: ComputedTopicResult = topic.result
        ? {
            eligibleUnits: topic.result.eligibleUnits,
            votedUnits: topic.result.votedUnits,
            totalVotes: topic.result.totalVotes,
            optionCounts: topic.result.optionCounts as unknown as OptionCount[],
            winnerOptionId: topic.result.winnerOptionId,
          }
        : // Asambleas cerradas antes de H24 no tienen resultado guardado: se
          // calcula igual (ya no entran votos), sin guardarlo.
          await this.computeLive(
            topic.id,
            topic.options.map((option) => option.id),
            topic._count.voteParticipations,
            liveEligible,
          );

      const votesByOption = new Map(
        stored.optionCounts.map((item) => [item.optionId, item.votes]),
      );
      topics.push({
        id: topic.id,
        question: topic.question,
        eligibleUnits: stored.eligibleUnits,
        votedUnits: stored.votedUnits,
        participationPct: pct(stored.votedUnits, stored.eligibleUnits),
        totalVotes: stored.totalVotes,
        options: topic.options.map((option) => {
          const votes = votesByOption.get(option.id) ?? 0;
          return {
            id: option.id,
            text: option.text,
            votes,
            pct: pct(votes, stored.totalVotes),
          };
        }),
        winnerOptionId: stored.winnerOptionId,
        // Empate: hubo votos pero ninguna opción quedó sola en el máximo.
        isTie: stored.totalVotes > 0 && stored.winnerOptionId === null,
      });
    }

    return {
      id: assembly.id,
      title: assembly.title,
      status: assembly.status,
      closedAt: assembly.closedAt,
      topics,
    };
  }

  /** Unidades que votaron un tema, por código de unidad, sin la opción elegida. */
  async getParticipation(topicId: string, query: ParticipationQueryDto) {
    const exists = await this.prisma.assemblyTopic.findUnique({
      where: { id: topicId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(MSG_TOPIC_NOT_FOUND);

    const { page, pageSize } = query;
    const [total, rows] = await Promise.all([
      this.prisma.voteParticipation.count({ where: { topicId } }),
      this.prisma.voteParticipation.findMany({
        where: { topicId },
        orderBy: [{ unit: { code: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { votedAt: true, unit: { select: { code: true } } },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        unitCode: row.unit.code,
        votedAt: row.votedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Asambleas Cerradas, la más reciente primero (para el residente). */
  async findClosed(query: ClosedAssembliesQueryDto) {
    const { page, pageSize } = query;
    const where = { status: 'CERRADA' as const };
    const [total, rows] = await Promise.all([
      this.prisma.assembly.count({ where }),
      this.prisma.assembly.findMany({
        where,
        orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          closedAt: true,
          _count: { select: { topics: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.title,
        closedAt: row.closedAt,
        topicCount: row._count.topics,
      })),
      total,
      page,
      pageSize,
    };
  }

  private async computeLive(
    topicId: string,
    optionIds: string[],
    votedUnits: number,
    eligibleUnits: number,
  ): Promise<ComputedTopicResult> {
    const grouped = await this.prisma.ballot.groupBy({
      by: ['optionId'],
      where: { topicId },
      _count: { _all: true },
    });
    return computeTopicResult({
      optionIds,
      votesByOption: new Map(
        grouped.map((row) => [row.optionId, row._count._all]),
      ),
      votedUnits,
      eligibleUnits,
    });
  }
}
