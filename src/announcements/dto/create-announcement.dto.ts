import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { AnnouncementCategory, AudienceType } from '@PrismaClient';
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_MESSAGES,
} from '../announcements.constants.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAnnouncementDto {
  @ApiProperty({
    example: 'Corte de agua el 4 de noviembre',
    minLength: 5,
    maxLength: 100,
  })
  @Transform(trim)
  @IsString({ message: ANNOUNCEMENT_MESSAGES.title })
  @Length(ANNOUNCEMENT_LIMITS.titleMin, ANNOUNCEMENT_LIMITS.titleMax, {
    message: ANNOUNCEMENT_MESSAGES.title,
  })
  title!: string;

  @ApiProperty({
    example: 'No habrá agua de 08:00 a 16:00 en las tres torres.',
    minLength: 10,
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString({ message: ANNOUNCEMENT_MESSAGES.body })
  @Length(ANNOUNCEMENT_LIMITS.bodyMin, ANNOUNCEMENT_LIMITS.bodyMax, {
    message: ANNOUNCEMENT_MESSAGES.body,
  })
  body!: string;

  @ApiProperty({ enum: AnnouncementCategory })
  @IsEnum(AnnouncementCategory, { message: ANNOUNCEMENT_MESSAGES.category })
  category!: AnnouncementCategory;

  @ApiProperty({ enum: AudienceType })
  @IsEnum(AudienceType, { message: ANNOUNCEMENT_MESSAGES.audience })
  audience!: AudienceType;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'De 1 a 3 torres, solo con audience TORRES.',
  })
  @ValidateIf(
    (dto: CreateAnnouncementDto) => dto.audience === AudienceType.TORRES,
  )
  @IsArray({ message: ANNOUNCEMENT_MESSAGES.towerIds })
  @ArrayMinSize(1, { message: ANNOUNCEMENT_MESSAGES.towerIds })
  @ArrayMaxSize(ANNOUNCEMENT_LIMITS.maxTowers, {
    message: ANNOUNCEMENT_MESSAGES.towerIds,
  })
  @ArrayUnique({ message: ANNOUNCEMENT_MESSAGES.towerIds })
  @IsUUID('all', { each: true, message: ANNOUNCEMENT_MESSAGES.towerIdFormat })
  towerIds?: string[];

  @ApiProperty({
    example: '2026-11-14',
    description: 'AAAA-MM-DD, de mañana a 90 días después de hoy.',
  })
  @Matches(DATE_ONLY, { message: ANNOUNCEMENT_MESSAGES.expiresOnFormat })
  @IsISO8601(
    { strict: true },
    { message: ANNOUNCEMENT_MESSAGES.expiresOnFormat },
  )
  expiresOn!: string;
}
