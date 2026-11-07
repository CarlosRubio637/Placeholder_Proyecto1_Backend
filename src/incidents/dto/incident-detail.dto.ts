import { ApiProperty } from '@nestjs/swagger';
import {
  IncidentEventType,
  IncidentLocation,
  IncidentPriority,
  IncidentStatus,
  Role,
} from '@PrismaClient';
import type {
  IncidentDetail,
  IncidentListItem,
} from '../repositories/index.js';
import { IncidentPhotoDto, photoUrl } from './incident-response.dto.js';

/** Fila de la lista "Mis incidencias" (H11). */
export class IncidentListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'INC-2026-00001' }) number!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: IncidentLocation }) location!: IncidentLocation;
  @ApiProperty({ enum: IncidentStatus }) status!: IncidentStatus;
  @ApiProperty({ enum: IncidentPriority }) priority!: IncidentPriority;
  @ApiProperty() createdAt!: Date;

  static fromEntity(incident: IncidentListItem): IncidentListItemDto {
    return { ...incident };
  }
}

/** Respuesta paginada de GET /incidencias/mias (H11). */
export class IncidentListDto {
  @ApiProperty({ type: [IncidentListItemDto] }) data!: IncidentListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class IncidentAssigneeDto {
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'Fontanería' }) specialty!: string;
}

/** Evento del historial (H11). Nunca se modifica ni se borra. */
export class IncidentEventDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: IncidentEventType }) type!: IncidentEventType;
  @ApiProperty({ enum: IncidentStatus, nullable: true })
  fromStatus!: IncidentStatus | null;
  @ApiProperty({ enum: IncidentStatus, nullable: true })
  toStatus!: IncidentStatus | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Prioridad o responsable anterior (eventos PRIORIDAD y ASIGNACION).',
  })
  fromValue!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Prioridad o responsable nuevo.',
  })
  toValue!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({
    example: 'Administración',
    description:
      '"Administración" para eventos de un administrador (no se exponen cuentas internas); el nombre del residente en los demás.',
  })
  authorLabel!: string;
  @ApiProperty() createdAt!: Date;
}

/** Respuesta de GET /incidencias/:id (H11; el administrador la usa desde H12). */
export class IncidentDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'INC-2026-00001' }) number!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: IncidentLocation }) location!: IncidentLocation;
  @ApiProperty({ type: String, nullable: true }) locationDetail!: string | null;
  @ApiProperty({ enum: IncidentStatus }) status!: IncidentStatus;
  @ApiProperty({ enum: IncidentPriority }) priority!: IncidentPriority;
  @ApiProperty({ type: Date, nullable: true }) resolvedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ example: { code: 'A-101' } }) unit!: { code: string };
  @ApiProperty({ type: IncidentAssigneeDto, nullable: true })
  assignee!: IncidentAssigneeDto | null;
  @ApiProperty({ type: [IncidentPhotoDto] }) photos!: IncidentPhotoDto[];
  @ApiProperty({ type: [IncidentEventDto] }) events!: IncidentEventDto[];

  static fromEntity(incident: IncidentDetail): IncidentDetailDto {
    return {
      id: incident.id,
      number: incident.number,
      title: incident.title,
      description: incident.description,
      location: incident.location,
      locationDetail: incident.locationDetail,
      status: incident.status,
      priority: incident.priority,
      resolvedAt: incident.resolvedAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      unit: incident.unit,
      assignee: incident.assignee,
      photos: incident.photos.map((photo) => ({
        id: photo.id,
        url: photoUrl(photo.id),
      })),
      events: incident.events.map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        fromValue: event.fromValue,
        toValue: event.toValue,
        note: event.note,
        authorLabel: authorLabel(event.author),
        createdAt: event.createdAt,
      })),
    };
  }
}

/**
 * Quién aparece como autor de un evento. Los eventos de administración se
 * muestran como "Administración" para no exponer cuentas internas (H11).
 */
export function authorLabel(author: {
  role: Role;
  profile: { fullName: string } | null;
}): string {
  if (author.role === Role.RESIDENTE) {
    return author.profile?.fullName ?? 'Residente';
  }
  return 'Administración';
}
