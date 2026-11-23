import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@Prisma/services';
import {
  NotificationsService,
  SourceModule,
  RecipientType,
} from '@Notifications';
import { computeTopicResult } from '../../voting/results.utils.js';

/** Datos que necesita el aviso de apertura. */
interface OpenedAssembly {
  id: string;
  title: string;
  endsAt: Date;
  topicCount: number;
}

/** Máximo de caracteres del título de una notificación (H30). */
const NOTIFICATION_TITLE_MAX = 100;

@Injectable()
export class AssembliesCronService {
  private readonly logger = new Logger(AssembliesCronService.name);

  /** Evita que una corrida empiece mientras la anterior sigue en curso. */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAssembliesLifecycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Cada paso va por separado: si falla abrir, igual se intenta cerrar.
      await this.openDueAssemblies();
      await this.closeDueAssemblies();
    } finally {
      this.running = false;
    }
  }

  // -------------------------------------------------------------------------
  // Programada -> Abierta
  // -------------------------------------------------------------------------
  private async openDueAssemblies(): Promise<void> {
    const due = await this.prisma.assembly.findMany({
      where: { status: 'PROGRAMADA', startsAt: { lte: new Date() } },
      select: { id: true },
    });

    for (const { id } of due) {
      try {
        const opened = await this.openAssembly(id);
        // null = otra corrida ya la abrió: no se notifica por segunda vez.
        if (opened) await this.notifyOpened(opened);
      } catch (error) {
        // Un error en una asamblea no debe impedir abrir las demás.
        this.logger.error(`No se pudo abrir la asamblea ${id}`, error as Error);
      }
    }
  }

  /**
   * Cambia el estado y guarda las unidades habilitadas en UNA transacción.
   * El cambio está condicionado por `status = PROGRAMADA`: si dos corridas
   * coinciden, solo una obtiene count = 1 y la otra devuelve null.
   */
  private async openAssembly(id: string): Promise<OpenedAssembly | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.assembly.updateMany({
        where: { id, status: 'PROGRAMADA' },
        data: { status: 'ABIERTA', openedAt: new Date() },
      });
      if (claimed.count === 0) return null;

      // Unidades con al menos un residente activo EN ESTE MOMENTO
      // (Supuestos, sección 7). Esta lista ya no cambia después.
      const units = await tx.unit.findMany({
        where: { residents: { some: { isActive: true } } },
        select: { id: true },
      });
      await tx.assemblyEligibleUnit.createMany({
        data: units.map((unit) => ({ assemblyId: id, unitId: unit.id })),
      });

      // Se lee DESPUÉS de reclamar la fila, así el título, el cierre y la
      // cantidad de temas son los definitivos (el admin pudo editar justo antes).
      const fresh = await tx.assembly.findUniqueOrThrow({
        where: { id },
        select: {
          title: true,
          endsAt: true,
          _count: { select: { topics: true } },
        },
      });

      return {
        id,
        title: fresh.title,
        endsAt: fresh.endsAt,
        topicCount: fresh._count.topics,
      };
    });
  }

  /**
   * El aviso se envía DESPUÉS de confirmar la transacción: `send` usa su propio
   * cliente de Prisma y no puede quedar dentro de ella. Si falla, la asamblea
   * ya quedó abierta y solo se deja constancia en el registro del servidor.
   */
  private async notifyOpened(assembly: OpenedAssembly): Promise<void> {
    const closesAt = new Intl.DateTimeFormat('es-SV', {
      timeZone: 'America/El_Salvador',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(assembly.endsAt);

    try {
      await this.notificationsService.send({
        recipient: { type: RecipientType.TODOS, ids: [] },
        // El título de una notificación admite máximo 100 caracteres (H30) y
        // un título de asamblea de 100 más el prefijo lo excedería.
        title: this.truncate(
          `Asamblea abierta: ${assembly.title}`,
          NOTIFICATION_TITLE_MAX,
        ),
        message: `Ya puedes votar ${this.topicsText(assembly.topicCount)} hasta el ${closesAt.replace(/\.$/, '')}.`,
        sourceModule: SourceModule.VOTACIONES,
        reference: { type: 'assembly', id: assembly.id },
      });
      this.logger.log(`Asamblea abierta y notificada: ${assembly.id}`);
    } catch (error) {
      this.logger.error(
        `Asamblea ${assembly.id} abierta, pero falló el aviso`,
        error as Error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Abierta -> Cerrada
  // -------------------------------------------------------------------------
  private async closeDueAssemblies(): Promise<void> {
    let due: { id: string }[];
    try {
      due = await this.prisma.assembly.findMany({
        where: { status: 'ABIERTA', endsAt: { lte: new Date() } },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(
        'No se pudieron buscar asambleas por cerrar',
        error as Error,
      );
      return;
    }

    let closed = 0;
    for (const { id } of due) {
      try {
        if (await this.closeAssembly(id)) closed += 1;
      } catch (error) {
        // Un error en una asamblea no debe impedir cerrar las demás.
        this.logger.error(
          `No se pudo cerrar la asamblea ${id}`,
          error as Error,
        );
      }
    }
    if (closed > 0) this.logger.log(`Asambleas cerradas: ${closed}`);
  }

  /**
   * H24: cierra la asamblea y guarda el resultado de cada tema en UNA
   * transacción. El cambio está condicionado por `status = ABIERTA`, así que
   * si dos corridas coinciden solo una calcula el resultado.
   *
   * El UPDATE bloquea la fila de la asamblea hasta el commit. Cada voto (H23)
   * toma un bloqueo compartido sobre esa misma fila dentro de su transacción:
   * los votos en curso terminan antes de que se cuente, y los que lleguen
   * después esperan y ya ven la asamblea Cerrada (409). Así ningún voto entra
   * después del cierre ni queda fuera del conteo.
   */
  private async closeAssembly(id: string): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const claimed = await tx.assembly.updateMany({
          where: { id, status: 'ABIERTA' },
          data: { status: 'CERRADA', closedAt: now },
        });
        if (claimed.count === 0) return false;

        const eligibleUnits = await tx.assemblyEligibleUnit.count({
          where: { assemblyId: id },
        });
        const topics = await tx.assemblyTopic.findMany({
          where: { assemblyId: id },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            options: { orderBy: { order: 'asc' }, select: { id: true } },
          },
        });

        for (const topic of topics) {
          const votedUnits = await tx.voteParticipation.count({
            where: { topicId: topic.id },
          });
          const grouped = await tx.ballot.groupBy({
            by: ['optionId'],
            where: { topicId: topic.id },
            _count: { _all: true },
          });
          const result = computeTopicResult({
            optionIds: topic.options.map((option) => option.id),
            votesByOption: new Map(
              grouped.map((row) => [row.optionId, row._count._all]),
            ),
            votedUnits,
            eligibleUnits,
          });
          await tx.topicResult.create({
            data: {
              topicId: topic.id,
              eligibleUnits: result.eligibleUnits,
              votedUnits: result.votedUnits,
              totalVotes: result.totalVotes,
              optionCounts: result.optionCounts.map((item) => ({ ...item })),
              winnerOptionId: result.winnerOptionId,
              computedAt: now,
            },
          });
        }
        return true;
      },
      // Una asamblea tiene hasta 10 temas; el margen evita cortes en máquinas lentas.
      { timeout: 20_000 },
    );
  }

  /** DEF-302: "1 tema" en singular; el resto en plural. */
  private topicsText(count: number): string {
    return count === 1 ? '1 tema' : `${count} temas`;
  }

  private truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }
}
