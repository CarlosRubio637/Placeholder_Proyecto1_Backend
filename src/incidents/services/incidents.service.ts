import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { badRequest } from '@Common/validation';
import { FORBIDDEN_BODY } from '@Auth/guards';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { toSearchName } from '@Users/services';
import { Role, type User } from '@PrismaClient';
import type { CreateIncidentDto } from '../dto/index.js';
import { IncidentCreatedDto } from '../dto/index.js';
import {
  IncidentRepository,
  type IncidentWithPhotos,
} from '../repositories/index.js';
import { IncidentPhotoStorage, type PhotoToSave } from '../storage/index.js';
import { currentYear, detectImageType } from '../utils/index.js';
import {
  LOCATION_LABELS,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MIN_PHOTOS,
  PHOTO_MESSAGES,
} from '../incidents.constants.js';

/** Archivo tal como lo deja multer en memoria. */
export type UploadedPhoto = Pick<Express.Multer.File, 'buffer' | 'size'>;

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly repository: IncidentRepository,
    private readonly storage: IncidentPhotoStorage,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Registra una incidencia del residente (H10): valida las fotos por su
   * contenido, las guarda en disco y crea incidencia + fotos + primer evento
   * en una transacción. Si algo falla no queda ni la incidencia ni archivos.
   * Después avisa a los administradores activos (H30).
   */
  async create(
    reporter: User,
    dto: CreateIncidentDto,
    files: UploadedPhoto[] = [],
  ): Promise<IncidentCreatedDto> {
    const photos = this.validatePhotos(files);

    // Un residente siempre tiene unidad (CHECK de H38); se comprueba igual.
    if (!reporter.unitId) {
      throw new ForbiddenException(FORBIDDEN_BODY);
    }

    const id = randomUUID();
    let saved;
    try {
      saved = await this.storage.saveAll(id, photos);
    } catch (error) {
      this.logger.error(
        `No se pudieron guardar las fotos de la incidencia ${id}`,
        error,
      );
      throw new InternalServerErrorException(
        'No se pudieron guardar las fotografías.',
      );
    }

    let incident: IncidentWithPhotos;
    try {
      incident = await this.repository.create({
        id,
        year: currentYear(),
        unitId: reporter.unitId,
        reporterId: reporter.id,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        locationDetail: dto.locationDetail ?? null,
        photos: saved,
        searchKeyFor: (number) => toSearchName(`${number} ${dto.title}`),
      });
    } catch (error) {
      await this.storage.removeIncident(id);
      throw error;
    }

    await this.notifyAdmins(incident);
    return IncidentCreatedDto.fromEntity(incident);
  }

  /**
   * Archivo de una fotografía. La ve el Administrador o un residente de la
   * unidad de la incidencia (el guard ya dejó fuera a Seguridad).
   */
  async getPhoto(viewer: User, photoId: string) {
    const photo = await this.repository.findPhoto(photoId);
    if (!photo) {
      throw new NotFoundException('La fotografía no existe.');
    }
    if (
      viewer.role === Role.RESIDENTE &&
      photo.incident.unitId !== viewer.unitId
    ) {
      throw new ForbiddenException(FORBIDDEN_BODY);
    }

    const file = await this.storage.open(photo.path);
    if (!file) {
      this.logger.error(`Falta en disco la foto ${photo.id} (${photo.path})`);
      throw new NotFoundException('La fotografía no existe.');
    }
    return { ...file, mimeType: photo.mimeType };
  }

  private validatePhotos(files: UploadedPhoto[]): PhotoToSave[] {
    if (files.length < MIN_PHOTOS) {
      throw badRequest('photos', PHOTO_MESSAGES.required);
    }
    if (files.length > MAX_PHOTOS) {
      throw badRequest('photos', PHOTO_MESSAGES.tooMany);
    }
    return files.map((file) => {
      const mimeType = detectImageType(file.buffer);
      if (!mimeType || file.size > MAX_PHOTO_BYTES) {
        throw badRequest('photos', PHOTO_MESSAGES.invalid);
      }
      return { buffer: file.buffer, mimeType };
    });
  }

  /**
   * Aviso "Nueva incidencia" a los administradores activos (H10 + H30). Se
   * envía después de confirmar la transacción: si el aviso falla, la
   * incidencia ya quedó registrada y solo se deja constancia en el log.
   */
  private async notifyAdmins(incident: IncidentWithPhotos): Promise<void> {
    try {
      const adminIds = await this.repository.findActiveAdminIds();
      if (adminIds.length === 0) {
        return;
      }
      await this.notifications.send({
        recipient: { type: RecipientType.USUARIO, ids: adminIds },
        title: `Nueva incidencia ${incident.number}`,
        message: `La unidad ${incident.unit.code} reportó “${incident.title}” en ${LOCATION_LABELS[incident.location]}.`,
        sourceModule: SourceModule.INCIDENCIAS,
        reference: { type: 'incident', id: incident.id },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar de la incidencia ${incident.number}`,
        error,
      );
    }
  }
}
