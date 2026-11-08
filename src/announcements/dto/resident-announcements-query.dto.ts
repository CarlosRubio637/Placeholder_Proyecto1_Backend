import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AnnouncementCategory } from '@PrismaClient';
import {
  ANNOUNCEMENT_MESSAGES,
  RESIDENT_ANNOUNCEMENT_MESSAGES,
  RESIDENT_MAX_PAGE,
  RESIDENT_MAX_PAGE_SIZE,
  RESIDENT_PAGE_SIZE,
  RESIDENT_TABS,
  type ResidentTab,
} from '../announcements.constants.js';

export class ResidentAnnouncementsQueryDto {
  @ApiPropertyOptional({ enum: RESIDENT_TABS, default: 'vigentes' })
  @IsIn(RESIDENT_TABS, { message: RESIDENT_ANNOUNCEMENT_MESSAGES.tab })
  tab: ResidentTab = 'vigentes';

  @ApiPropertyOptional({ enum: AnnouncementCategory })
  @IsOptional()
  @IsEnum(AnnouncementCategory, { message: ANNOUNCEMENT_MESSAGES.category })
  category?: AnnouncementCategory;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: RESIDENT_MAX_PAGE })
  @Type(() => Number)
  @IsInt({ message: RESIDENT_ANNOUNCEMENT_MESSAGES.page })
  @Min(1, { message: RESIDENT_ANNOUNCEMENT_MESSAGES.page })
  @Max(RESIDENT_MAX_PAGE, {
    message: RESIDENT_ANNOUNCEMENT_MESSAGES.pageTooHigh,
  })
  page: number = 1;

  @ApiPropertyOptional({
    default: RESIDENT_PAGE_SIZE,
    minimum: 1,
    maximum: RESIDENT_MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: RESIDENT_ANNOUNCEMENT_MESSAGES.pageSize })
  @Min(1, { message: RESIDENT_ANNOUNCEMENT_MESSAGES.pageSize })
  @Max(RESIDENT_MAX_PAGE_SIZE, {
    message: RESIDENT_ANNOUNCEMENT_MESSAGES.pageSize,
  })
  pageSize: number = RESIDENT_PAGE_SIZE;
}
