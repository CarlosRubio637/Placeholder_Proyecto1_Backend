import { Injectable, Logger } from '@nestjs/common';
import { badRequest } from '@Common/validation';
import { addDays, fromDbDate, toDbDate, todayIso } from '@Common/time';
import { NotificationsService } from '@Notifications';
import { AudienceType, type User } from '@PrismaClient';
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_MESSAGES,
  expiryWindowMessage,
  towerNotFoundMessage,
} from '../announcements.constants.js';
import {
  AnnouncementDto,
  type AudienceCountDto,
  type AudienceQueryDto,
  type CreateAnnouncementDto,
} from '../dto/index.js';
import { TowerNotFoundError } from '../errors/index.js';
import {
  AnnouncementRepository,
  type PublishedAnnouncement,
} from '../repositories/index.js';
import { buildAnnouncementNotification } from './announcement-notification.js';

function toHttpError(error: unknown): unknown {
  if (error instanceof TowerNotFoundError) {
    return badRequest('towerIds', towerNotFoundMessage(error.towerId));
  }
  return error;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly repository: AnnouncementRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async countAudience(query: AudienceQueryDto): Promise<AudienceCountDto> {
    const recipientCount = await this.repository
      .countRecipients(query.towerIds)
      .catch((error: unknown) => {
        throw toHttpError(error);
      });
    return { recipientCount };
  }

  async publish(
    admin: User,
    dto: CreateAnnouncementDto,
    now = new Date(),
  ): Promise<AnnouncementDto> {
    if (dto.audience === AudienceType.TODOS && dto.towerIds !== undefined) {
      throw badRequest('towerIds', ANNOUNCEMENT_MESSAGES.towerIdsWithAll);
    }
    this.assertExpiryWindow(dto.expiresOn, todayIso(now));

    const towerIds =
      dto.audience === AudienceType.TORRES ? (dto.towerIds ?? []) : [];
    const announcement = await this.repository
      .publish({
        title: dto.title,
        body: dto.body,
        category: dto.category,
        audience: dto.audience,
        towerIds,
        expiresOn: toDbDate(dto.expiresOn),
        createdById: admin.id,
      })
      .catch((error: unknown) => {
        throw toHttpError(error);
      });

    await this.notify(announcement, towerIds);
    return AnnouncementDto.fromEntity(announcement);
  }

  private assertExpiryWindow(expiresOn: string, today: string): void {
    const earliest = addDays(today, 1);
    const latest = addDays(today, ANNOUNCEMENT_LIMITS.expiryMaxDays);
    if (expiresOn < earliest || expiresOn > latest) {
      throw badRequest('expiresOn', expiryWindowMessage(latest));
    }
  }

  private async notify(
    announcement: PublishedAnnouncement,
    towerIds: string[],
  ): Promise<void> {
    try {
      await this.notifications.send(
        buildAnnouncementNotification({
          id: announcement.id,
          title: announcement.title,
          category: announcement.category,
          audience: announcement.audience,
          expiresOn: fromDbDate(announcement.expiresOn),
          towerIds,
        }),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo avisar del comunicado ${announcement.id}`,
        error,
      );
    }
  }
}
