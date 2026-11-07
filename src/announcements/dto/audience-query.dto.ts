import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import {
  ANNOUNCEMENT_LIMITS,
  ANNOUNCEMENT_MESSAGES,
} from '../announcements.constants.js';

const toIdList = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((part) => String(part).split(','))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
};

export class AudienceQueryDto {
  @ApiPropertyOptional({
    type: String,
    example:
      '0b6f4c1e-8a57-4b55-9a52-5a3f4c7d2e11,6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b',
    description:
      'Ids de torre separados por coma. Vacío cuenta todo el condominio.',
  })
  @Transform(toIdList)
  @IsOptional()
  @IsArray({ message: ANNOUNCEMENT_MESSAGES.towerIdFormat })
  @ArrayMaxSize(ANNOUNCEMENT_LIMITS.maxTowers, {
    message: ANNOUNCEMENT_MESSAGES.maxTowers,
  })
  @IsUUID('all', { each: true, message: ANNOUNCEMENT_MESSAGES.towerIdFormat })
  towerIds?: string[];
}
