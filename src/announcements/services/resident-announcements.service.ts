import { Injectable, NotFoundException } from '@nestjs/common';
import { toDbDate, todayIso } from '@Common/time';
import type { User } from '@PrismaClient';
import { RESIDENT_ANNOUNCEMENT_MESSAGES } from '../announcements.constants.js';
import {
  ResidentAnnouncementDto,
  ResidentAnnouncementSummaryDto,
  type ResidentAnnouncementPageDto,
  type ResidentAnnouncementsQueryDto,
} from '../dto/index.js';
import { AnnouncementNotFoundError } from '../errors/index.js';
import { AnnouncementRepository } from '../repositories/index.js';

function toHttpError(error: unknown): unknown {
  if (error instanceof AnnouncementNotFoundError) {
    return new NotFoundException(RESIDENT_ANNOUNCEMENT_MESSAGES.notFound);
  }
  return error;
}

@Injectable()
export class ResidentAnnouncementsService {
  constructor(private readonly repository: AnnouncementRepository) {}

  async list(
    user: User,
    query: ResidentAnnouncementsQueryDto,
    now = new Date(),
  ): Promise<ResidentAnnouncementPageDto> {
    const { page, pageSize } = query;
    const { rows, total } = await this.repository.listForResident(user.id, {
      archived: query.tab === 'archivados',
      category: query.category,
      today: toDbDate(todayIso(now)),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      data: rows.map((row) => ResidentAnnouncementSummaryDto.fromRow(row)),
      total,
      page,
      pageSize,
    };
  }

  async read(
    user: User,
    announcementId: string,
  ): Promise<ResidentAnnouncementDto> {
    try {
      const detail = await this.repository.markRead(user.id, announcementId);
      return ResidentAnnouncementDto.fromDetail(detail);
    } catch (error) {
      throw toHttpError(error);
    }
  }
}
