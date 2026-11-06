import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  IncidentEventType,
  IncidentStatus,
  Role,
  type IncidentLocation,
  type Prisma,
} from '@PrismaClient';
import type { SavedPhoto } from '../storage/index.js';
import { formatIncidentNumber } from '../utils/index.js';

export interface CreateIncidentData {
  /** Se genera antes para guardar las fotos en incidencias/<id>/. */
  id: string;
  year: number;
  unitId: string;
  reporterId: string;
  title: string;
  description: string;
  location: IncidentLocation;
  locationDetail: string | null;
  photos: SavedPhoto[];
  /** Arma el searchKey a partir del número asignado y el título. */
  searchKeyFor: (number: string) => string;
}

const WITH_PHOTOS_AND_UNIT = {
  photos: { orderBy: { createdAt: 'asc' } },
  unit: { select: { code: true } },
} satisfies Prisma.IncidentInclude;

export type IncidentWithPhotos = Prisma.IncidentGetPayload<{
  include: typeof WITH_PHOTOS_AND_UNIT;
}>;

export type PhotoWithIncidentUnit = Prisma.IncidentPhotoGetPayload<{
  include: { incident: { select: { unitId: true } } };
}>;

/** Acceso a datos del módulo de incidencias. */
@Injectable()
export class IncidentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea en una sola transacción la incidencia (Pendiente, prioridad Media),
   * sus fotografías y el primer evento del historial. El número sale del
   * contador anual, que se incrementa con INSERT ... ON CONFLICT para que dos
   * registros simultáneos nunca reciban el mismo consecutivo.
   */
  create(data: CreateIncidentData): Promise<IncidentWithPhotos> {
    return this.prisma.$transaction(async (tx) => {
      const [{ last }] = await tx.$queryRaw<{ last: number }[]>`
        INSERT INTO incident_counters (year, last) VALUES (${data.year}, 1)
        ON CONFLICT (year) DO UPDATE SET last = incident_counters.last + 1
        RETURNING last`;
      const number = formatIncidentNumber(data.year, last);

      return tx.incident.create({
        data: {
          id: data.id,
          number,
          unitId: data.unitId,
          reporterId: data.reporterId,
          title: data.title,
          description: data.description,
          location: data.location,
          locationDetail: data.locationDetail,
          searchKey: data.searchKeyFor(number),
          photos: { create: data.photos },
          events: {
            create: {
              type: IncidentEventType.CREACION,
              toStatus: IncidentStatus.PENDIENTE,
              note: 'Incidencia registrada',
              authorId: data.reporterId,
            },
          },
        },
        include: WITH_PHOTOS_AND_UNIT,
      });
    });
  }

  /** Destinatarios del aviso de nueva incidencia: administradores activos. */
  async findActiveAdminIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMINISTRADOR, isActive: true },
      select: { id: true },
    });
    return admins.map((admin) => admin.id);
  }

  findPhoto(photoId: string): Promise<PhotoWithIncidentUnit | null> {
    return this.prisma.incidentPhoto.findUnique({
      where: { id: photoId },
      include: { incident: { select: { unitId: true } } },
    });
  }
}
