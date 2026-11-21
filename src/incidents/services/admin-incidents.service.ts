import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { daysInRange, todayIso } from '@Common/time';
import { badRequest } from '@Common/validation';
import {
  NOTIFICATION_LIMITS,
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { toSearchName } from '@Users/services';
import type { User } from '@PrismaClient';
import {
  ADMIN_INCIDENT_MESSAGES as M,
  STATUS_LABELS,
  STATUS_MESSAGES,
  type AdminIncidentListDto,
  type AdminIncidentsQuery,
  type ChangeStatusDto,
  type StatusChangedDto,
  type IncidentManagementDto,
  type MaintenanceStaffListDto,
  type UpdateIncidentDto,
} from '../dto/index.js';
import {
  AdminIncidentRepository,
  AssigneeRequiredError,
  IncidentNotFoundError,
  IncidentResolvedError,
  StatusChangedError,
  TransitionNotAllowedError,
} from '../repositories/index.js';

const ELLIPSIS = '…';

/** Recorta un texto al límite del servicio de avisos (H30). */
function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}${ELLIPSIS}`;
}

/**
 * Bandeja del administrador: priorizar y asignar (H12) y cambiar el estado
 * con su seguimiento (H13).
 */
@Injectable()
export class AdminIncidentsService {
  private readonly logger = new Logger(AdminIncidentsService.name);

  constructor(
    private readonly repository: AdminIncidentRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    query: AdminIncidentsQuery,
    now = new Date(),
  ): Promise<AdminIncidentListDto> {
    const { data, total } = await this.repository.list({
      status: query.status,
      priority: query.priority,
      location: query.location,
      assigneeId: query.assigneeId?.toLowerCase(),
      // La misma normalización con que se guardó el searchKey.
      search: query.search ? toSearchName(query.search) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    const today = todayIso(now);
    return {
      data: data.map((row) => ({
        id: row.id,
        number: row.number,
        title: row.title,
        unitCode: row.unit.code,
        location: row.location,
        status: row.status,
        priority: row.priority,
        assignee: row.assignee,
        daysOpen: daysInRange(todayIso(row.createdAt), today) - 1,
        createdAt: row.createdAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async staff(): Promise<MaintenanceStaffListDto> {
    return { data: await this.repository.activeStaff() };
  }

  async update(
    actor: User,
    incidentId: string,
    dto: UpdateIncidentDto,
  ): Promise<IncidentManagementDto> {
    if (dto.priority === undefined && dto.assigneeId === undefined) {
      throw badRequest('priority', M.nothingToChange);
    }

    let assignee: { id: string; name: string } | null | undefined;
    if (dto.assigneeId === null) {
      assignee = null;
    } else if (dto.assigneeId !== undefined) {
      assignee = await this.repository.findActiveStaff(dto.assigneeId);
      if (!assignee) throw badRequest('assigneeId', M.assigneeId);
    }

    try {
      const result = await this.repository.applyManagement({
        incidentId,
        actorId: actor.id,
        priority: dto.priority,
        assignee,
      });
      return {
        incident: result.incident,
        event: result.event
          ? {
              ...result.event,
              type: result.event.type as 'PRIORIDAD' | 'ASIGNACION',
            }
          : null,
      };
    } catch (error) {
      if (error instanceof IncidentNotFoundError) {
        throw new NotFoundException(M.notFound);
      }
      if (error instanceof IncidentResolvedError) {
        throw new ConflictException(M.resolved);
      }
      throw error;
    }
  }

  /**
   * Cambio de estado (H13): Pendiente → En proceso, En proceso → Resuelto y
   * Resuelto → En proceso. Después de confirmar avisa al residente que
   * reportó (H30); si el aviso falla, el cambio ya quedó.
   */
  async changeStatus(
    actor: User,
    incidentId: string,
    dto: ChangeStatusDto,
    now = new Date(),
  ): Promise<StatusChangedDto> {
    let result;
    try {
      result = await this.repository.applyStatusChange({
        incidentId,
        actorId: actor.id,
        expectedStatus: dto.expectedStatus,
        toStatus: dto.toStatus,
        note: dto.note,
        now,
      });
    } catch (error) {
      if (error instanceof IncidentNotFoundError) {
        throw new NotFoundException(STATUS_MESSAGES.notFound);
      }
      if (error instanceof TransitionNotAllowedError) {
        throw new ConflictException(
          STATUS_MESSAGES.notAllowed(dto.expectedStatus, dto.toStatus),
        );
      }
      if (error instanceof StatusChangedError) {
        throw new ConflictException(STATUS_MESSAGES.changed);
      }
      if (error instanceof AssigneeRequiredError) {
        throw new ConflictException(STATUS_MESSAGES.needsAssignee);
      }
      throw error;
    }

    await this.notifyReporter(result);
    return { incident: result.incident, event: result.event };
  }

  private async notifyReporter(result: {
    reporterId: string;
    number: string;
    title: string;
    incident: { id: string; status: keyof typeof STATUS_LABELS };
    event: { note: string };
  }): Promise<void> {
    const label = STATUS_LABELS[result.incident.status];
    try {
      await this.notifications.send({
        recipient: { type: RecipientType.USUARIO, ids: [result.reporterId] },
        title: fit(
          `Incidencia ${result.number}: ${label}`,
          NOTIFICATION_LIMITS.maxTitleLength,
        ),
        // La observación completa queda en el historial; el aviso se recorta
        // si pasa del límite de H30.
        message: fit(
          `Tu reporte “${result.title}” pasó a ${label}. ${result.event.note}`,
          NOTIFICATION_LIMITS.maxMessageLength,
        ),
        sourceModule: SourceModule.INCIDENCIAS,
        reference: { type: 'incident', id: result.incident.id },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar el cambio de estado de ${result.number}`,
        error as Error,
      );
    }
  }
}
