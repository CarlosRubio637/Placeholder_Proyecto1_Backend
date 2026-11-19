import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { AnnouncementCategory } from '@PrismaClient';
import {
  ADMIN_ANNOUNCEMENT_MESSAGES,
  ADMIN_PAGE_SIZE,
  ANNOUNCEMENT_MESSAGES,
  ANNOUNCEMENT_STATUSES,
  READERS_PAGE_SIZE,
  type AnnouncementStatus,
} from '../announcements.constants.js';
import { PageNumber, PageSize } from './pagination.js';

const BOOLEAN_TEXT: Record<string, boolean> = { true: true, false: false };

function toBoolean({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && value in BOOLEAN_TEXT
    ? BOOLEAN_TEXT[value]
    : value;
}

export class AdminAnnouncementsQueryDto {
  @ApiPropertyOptional({
    enum: ANNOUNCEMENT_STATUSES,
    description: 'Sin valor: vigentes y archivados.',
  })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_STATUSES, { message: ADMIN_ANNOUNCEMENT_MESSAGES.status })
  status?: AnnouncementStatus;

  @ApiPropertyOptional({ enum: AnnouncementCategory })
  @IsOptional()
  @IsEnum(AnnouncementCategory, { message: ANNOUNCEMENT_MESSAGES.category })
  category?: AnnouncementCategory;

  @PageNumber()
  page: number = 1;

  @PageSize(ADMIN_PAGE_SIZE)
  pageSize: number = ADMIN_PAGE_SIZE;
}

export class AnnouncementReadsQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: solo Leído. false: solo No leído. Sin valor: todos.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: ADMIN_ANNOUNCEMENT_MESSAGES.read })
  read?: boolean;

  @PageNumber()
  page: number = 1;

  @PageSize(READERS_PAGE_SIZE)
  pageSize: number = READERS_PAGE_SIZE;
}
