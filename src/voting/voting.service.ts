import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { badRequest } from '@Common/validation';
import { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import { CastVoteDto } from './dto/index.js';

// Mensajes del contrato de la historia (H23). Fuera de la clase para que los
// tests puedan compararlos sin importar la clase entera.
export const VOTING_MESSAGES = {
  assemblyNotFound: 'La asamblea no existe.',
  topicNotFound: 'El tema no existe.',
  optionNotInTopic: 'La opción no pertenece a este tema.',
  notOpen: 'La votación no está abierta.',
  alreadyVoted: 'Tu unidad ya votó este tema.',
  notEligible: 'Tu unidad no está habilitada para esta asamblea.',
} as const;

// Prisma marca una violación de restricción única con este código.
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class VotingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asambleas Abiertas donde la unidad del residente está habilitada (H23).
   * Cada fila trae cuántos temas ha votado la unidad hasta ahora.
   */
  async findActive(resident: User) {
    const unitId = this.requireUnit(resident);

    const assemblies = await this.prisma.assembly.findMany({
      where: {
        status: 'ABIERTA',
        eligibleUnits: { some: { unitId } },
      },
      // "Cierre más cercano primero" (criterio de aceptación).
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { topics: true } } },
    });

    if (assemblies.length === 0) return { data: [] };

    // Temas votados por esta unidad en cada asamblea, en una sola consulta.
    const voted = await this.prisma.voteParticipation.groupBy({
      by: ['topicId'],
      where: {
        unitId,
        topic: { assemblyId: { in: assemblies.map((a) => a.id) } },
      },
    });
    // Mapa topicId → assemblyId para contar por asamblea.
    const topicAssembly = new Map<string, string>();
    const topics = await this.prisma.assemblyTopic.findMany({
      where: { assemblyId: { in: assemblies.map((a) => a.id) } },
      select: { id: true, assemblyId: true },
    });
    for (const topic of topics) topicAssembly.set(topic.id, topic.assemblyId);

    const votedByAssembly = new Map<string, number>();
    for (const row of voted) {
      const assemblyId = topicAssembly.get(row.topicId);
      if (!assemblyId) continue;
      votedByAssembly.set(assemblyId, (votedByAssembly.get(assemblyId) ?? 0) + 1);
    }

    return {
      data: assemblies.map((assembly) => ({
        id: assembly.id,
        title: assembly.title,
        endsAt: assembly.endsAt,
        topicCount: assembly._count.topics,
        votedTopics: votedByAssembly.get(assembly.id) ?? 0,
      })),
    };
  }

  /**
   * Detalle de una asamblea para el residente (H23). Solo devuelve asambleas
   * donde su unidad está habilitada: si no, 404 (no revela que existe).
   *
   * `myUnitVote` por tema muestra si la unidad ya votó y, en ese caso, quién
   * de la unidad lo hizo (`byMe`). Nunca revela cuál opción se eligió.
   */
  async findOne(resident: User, id: string) {
    const unitId = this.requireUnit(resident);

    const assembly = await this.prisma.assembly.findFirst({
      where: { id, eligibleUnits: { some: { unitId } } },
      include: {
        topics: {
          orderBy: { order: 'asc' },
          include: {
            options: { orderBy: { order: 'asc' } },
            voteParticipations: {
              where: { unitId },
              select: { votedAt: true, userId: true },
            },
          },
        },
      },
    });
    if (!assembly) {
      throw new NotFoundException(VOTING_MESSAGES.assemblyNotFound);
    }

    return {
      id: assembly.id,
      title: assembly.title,
      description: assembly.description,
      status: assembly.status,
      endsAt: assembly.endsAt,
      topics: assembly.topics.map((topic) => {
        const participation = topic.voteParticipations[0];
        return {
          id: topic.id,
          question: topic.question,
          options: topic.options.map((option) => ({
            id: option.id,
            text: option.text,
          })),
          myUnitVote: participation
            ? {
                votedAt: participation.votedAt,
                byMe: participation.userId === resident.id,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Emite el voto de la unidad en un tema (H23). Reglas y errores exactos de
   * la historia:
   * - Tema u opción inexistentes → 404.
   * - Opción que no pertenece al tema → 400.
   * - Asamblea no Abierta → 409 "La votación no está abierta.".
   * - Unidad no habilitada → 403.
   * - Ya votó (incluso si dos residentes de la unidad votan a la vez) → 409
   *   por la restricción única (topicId, unitId).
   *
   * Transacción: inserta VoteParticipation (puede chocar con 409) y luego
   * Ballot, sin vínculo entre ambos, para que el voto sea secreto.
   */
  async vote(resident: User, topicId: string, dto: CastVoteDto) {
    const unitId = this.requireUnit(resident);

    const topic = await this.prisma.assemblyTopic.findUnique({
      where: { id: topicId },
      include: {
        assembly: {
          select: {
            id: true,
            status: true,
            eligibleUnits: { where: { unitId }, select: { unitId: true } },
          },
        },
        options: { select: { id: true } },
      },
    });
    if (!topic) throw new NotFoundException(VOTING_MESSAGES.topicNotFound);

    const belongs = topic.options.some((option) => option.id === dto.optionId);
    if (!belongs) throw badRequest('optionId', VOTING_MESSAGES.optionNotInTopic);

    if (topic.assembly.status !== 'ABIERTA') {
      throw new ConflictException(VOTING_MESSAGES.notOpen);
    }
    if (topic.assembly.eligibleUnits.length === 0) {
      throw new ForbiddenException(VOTING_MESSAGES.notEligible);
    }

    try {
      const participation = await this.prisma.$transaction(async (tx) => {
        // Inserta PRIMERO la participación: la restricción única
        // (topicId, unitId) deja pasar solo el primer voto de la unidad.
        const created = await tx.voteParticipation.create({
          data: { topicId, unitId, userId: resident.id },
          select: { topicId: true, votedAt: true },
        });
        // Y luego el voto. Sin enlace con la participación, para que no se
        // pueda reconstruir "esta unidad eligió esta opción" a posteriori.
        await tx.ballot.create({
          data: { topicId, optionId: dto.optionId },
        });
        return created;
      });
      return { topicId: participation.topicId, votedAt: participation.votedAt };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(VOTING_MESSAGES.alreadyVoted);
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Utilidades privadas
  // -------------------------------------------------------------------------

  /** Un residente siempre tiene unidad (CHECK de H38); se comprueba igual. */
  private requireUnit(resident: User): string {
    if (!resident.unitId) {
      throw new ForbiddenException(VOTING_MESSAGES.notEligible);
    }
    return resident.unitId;
  }

  /** Error de violación de restricción única de Prisma. */
  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
    );
  }
}
