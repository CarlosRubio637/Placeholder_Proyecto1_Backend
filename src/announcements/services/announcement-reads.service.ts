import { Injectable, NotFoundException } from '@nestjs/common';
import { toDbDate, todayIso } from '@Common/time';
import { RESIDENT_ANNOUNCEMENT_MESSAGES } from '../announcements.constants.js';
import {
  AdminAnnouncementDetailDto,
  AdminAnnouncementSummaryDto,
  AnnouncementRecipientDto,
  type AdminAnnouncementPageDto,
  type AdminAnnouncementsQueryDto,
  type AnnouncementReadsPageDto,
  type AnnouncementReadsQueryDto,
} from '../dto/index.js';
import { AnnouncementNotFoundError } from '../errors/index.js';
import { AnnouncementRepository } from '../repositories/index.js';

@Injectable()
export class AnnouncementReadsService {
  constructor(private readonly repository: AnnouncementRepository) {}

  async list(
    query: AdminAnnouncementsQueryDto,
    now = new Date(),
  ): Promise<AdminAnnouncementPageDto> {
    const { page, pageSize } = query;
    const today = todayIso(now);
    const { rows, total } = await this.repository.listForAdmin({
      status: query.status,
      category: query.category,
      today: toDbDate(today),
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      data: rows.map((row) => AdminAnnouncementSummaryDto.fromRow(row, today)),
      total,
      page,
      pageSize,
    };
  }

  async readers(
    announcementId: string,
    query: AnnouncementReadsQueryDto,
    now = new Date(),
  ): Promise<AnnouncementReadsPageDto> {
    const { page, pageSize } = query;
    try {
      const reads = await this.repository.findForReads(announcementId, {
        read: query.read,
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return {
        announcement: AdminAnnouncementDetailDto.fromDetail(
          reads.announcement,
          todayIso(now),
        ),
        data: reads.recipients.map((row) =>
          AnnouncementRecipientDto.fromRow(row),
        ),
        total: reads.total,
        page,
        pageSize,
      };
    } catch (error) {
      if (error instanceof AnnouncementNotFoundError) {
        throw new NotFoundException(RESIDENT_ANNOUNCEMENT_MESSAGES.notFound);
      }
      throw error;
    }
  }
}
