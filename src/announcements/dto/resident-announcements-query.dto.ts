import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { AnnouncementCategory } from '@PrismaClient';
import {
  ANNOUNCEMENT_MESSAGES,
  RESIDENT_ANNOUNCEMENT_MESSAGES,
  RESIDENT_PAGE_SIZE,
  RESIDENT_TABS,
  type ResidentTab,
} from '../announcements.constants.js';
import { PageNumber, PageSize } from './pagination.js';

export class ResidentAnnouncementsQueryDto {
  @ApiPropertyOptional({ enum: RESIDENT_TABS, default: 'vigentes' })
  @IsIn(RESIDENT_TABS, { message: RESIDENT_ANNOUNCEMENT_MESSAGES.tab })
  tab: ResidentTab = 'vigentes';

  @ApiPropertyOptional({ enum: AnnouncementCategory })
  @IsOptional()
  @IsEnum(AnnouncementCategory, { message: ANNOUNCEMENT_MESSAGES.category })
  category?: AnnouncementCategory;

  @PageNumber()
  page: number = 1;

  @PageSize(RESIDENT_PAGE_SIZE)
  pageSize: number = RESIDENT_PAGE_SIZE;
}
