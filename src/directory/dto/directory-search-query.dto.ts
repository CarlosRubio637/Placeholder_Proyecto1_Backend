import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  type ValidationArguments,
} from 'class-validator';
import {
  DIRECTORY_MAX_PAGE,
  DIRECTORY_NAME_MAX,
  DIRECTORY_NAME_MIN,
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_SEARCH_MESSAGES,
} from '../directory.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

function nameLengthMessage({ value }: ValidationArguments): string {
  const tooLong =
    typeof value === 'string' && value.length > DIRECTORY_NAME_MAX;
  return tooLong
    ? DIRECTORY_SEARCH_MESSAGES.nameLong
    : DIRECTORY_SEARCH_MESSAGES.nameShort;
}

export class DirectorySearchQueryDto {
  @ApiPropertyOptional({
    minLength: DIRECTORY_NAME_MIN,
    maxLength: DIRECTORY_NAME_MAX,
    description: 'Parte del nombre; sin distinguir mayúsculas ni tildes.',
  })
  @IsOptional()
  @Transform(trim)
  @Length(DIRECTORY_NAME_MIN, DIRECTORY_NAME_MAX, {
    message: nameLengthMessage,
  })
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Con unitNumber.' })
  @IsOptional()
  @IsUUID('all', { message: DIRECTORY_SEARCH_MESSAGES.towerId })
  towerId?: string;

  @ApiPropertyOptional({ example: '101', description: 'Con towerId.' })
  @IsOptional()
  @Matches(/^\d{3}$/, { message: DIRECTORY_SEARCH_MESSAGES.unitNumber })
  unitNumber?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: DIRECTORY_MAX_PAGE })
  @Type(() => Number)
  @IsInt({ message: DIRECTORY_SEARCH_MESSAGES.page })
  @Min(1, { message: DIRECTORY_SEARCH_MESSAGES.page })
  @Max(DIRECTORY_MAX_PAGE, { message: DIRECTORY_SEARCH_MESSAGES.pageTooHigh })
  page: number = 1;

  @ApiPropertyOptional({
    default: DIRECTORY_PAGE_SIZE,
    minimum: 1,
    maximum: DIRECTORY_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: DIRECTORY_SEARCH_MESSAGES.pageSize })
  @Min(1, { message: DIRECTORY_SEARCH_MESSAGES.pageSize })
  @Max(DIRECTORY_PAGE_SIZE, { message: DIRECTORY_SEARCH_MESSAGES.pageSize })
  pageSize: number = DIRECTORY_PAGE_SIZE;
}
