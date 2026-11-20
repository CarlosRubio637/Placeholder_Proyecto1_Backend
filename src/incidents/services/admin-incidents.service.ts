import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { daysInRange, todayIso } from '@Common/time';
import { badRequest } from '@Common/validation';
import { toSearchName } from '@Users/services';
import type { User } from '@PrismaClient';
import {
  ADMIN_INCIDENT_MESSAGES as M,
  type AdminIncidentListDto,
  type AdminIncidentsQuery,
  type IncidentManagementDto,
  type MaintenanceStaffListDto,
  type UpdateIncidentDto,
} from '../dto/index.js';
import {
  AdminIncidentRepository,
  IncidentNotFoundError,
  IncidentResolvedError,
} from '../repositories/index.js';

/** Bandeja del administrador: priorizar y asignar (H12). */
@Injectable()
export class AdminIncidentsService {
  constructor(private readonly repository: AdminIncidentRepository) {}

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
}
