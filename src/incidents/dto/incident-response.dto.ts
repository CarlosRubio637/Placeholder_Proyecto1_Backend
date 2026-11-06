import { ApiProperty } from '@nestjs/swagger';
import {
  IncidentLocation,
  IncidentPriority,
  IncidentStatus,
} from '@PrismaClient';
import type { IncidentWithPhotos } from '../repositories/index.js';

export class IncidentPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'incidencias/fotos/2f1c…',
    description:
      'Ruta relativa a la API (API_URL). El frontend la sirve con su route handler app/archivos/[...ruta].',
  })
  url!: string;
}

/** Respuesta 201 de POST /incidencias (H10). */
export class IncidentCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'INC-2026-00001' })
  number!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: IncidentLocation })
  location!: IncidentLocation;

  @ApiProperty({ enum: IncidentStatus, example: IncidentStatus.PENDIENTE })
  status!: IncidentStatus;

  @ApiProperty({ enum: IncidentPriority, example: IncidentPriority.MEDIA })
  priority!: IncidentPriority;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: [IncidentPhotoDto] })
  photos!: IncidentPhotoDto[];

  static fromEntity(incident: IncidentWithPhotos): IncidentCreatedDto {
    return {
      id: incident.id,
      number: incident.number,
      title: incident.title,
      location: incident.location,
      status: incident.status,
      priority: incident.priority,
      createdAt: incident.createdAt,
      photos: incident.photos.map((photo) => ({
        id: photo.id,
        url: photoUrl(photo.id),
      })),
    };
  }
}

/** Ruta (relativa a la API) de GET /incidencias/fotos/:fotoId. */
export function photoUrl(photoId: string): string {
  return `incidencias/fotos/${photoId}`;
}
