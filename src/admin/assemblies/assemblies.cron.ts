import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@Prisma/services';
import {
  NotificationsService,
  SourceModule,
  RecipientType,
} from '@Notifications';

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
        message: `Ya puedes votar ${assembly.topicCount} temas hasta el ${closesAt}.`,
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
    try {
      // Una sola sentencia condicionada por estado: es idempotente.
      const result = await this.prisma.assembly.updateMany({
        where: { status: 'ABIERTA', endsAt: { lte: new Date() } },
        data: { status: 'CERRADA', closedAt: new Date() },
      });
      if (result.count > 0) {
        this.logger.log(`Asambleas cerradas: ${result.count}`);
      }
    } catch (error) {
      this.logger.error('No se pudieron cerrar las asambleas', error as Error);
    }
  }

  private truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }
}