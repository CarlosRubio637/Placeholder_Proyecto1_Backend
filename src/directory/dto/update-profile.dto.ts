import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DIRECTORY_MESSAGES } from '../directory.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const asPreference = { message: DIRECTORY_MESSAGES.directory };

export class DirectoryPrefsDto {
  @ApiProperty({ example: true })
  @IsBoolean(asPreference)
  visible!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean(asPreference)
  showName!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean(asPreference)
  showUnit!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean(asPreference)
  showPhone!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean(asPreference)
  showEmail!: boolean;
}

export class UpdateProfileDto {
  @ApiProperty({ example: '7845-1290', description: 'Formato 0000-0000.' })
  @Transform(trim)
  @IsString({ message: DIRECTORY_MESSAGES.phone })
  @Matches(/^\d{4}-\d{4}$/, { message: DIRECTORY_MESSAGES.phone })
  phone!: string;

  @ApiProperty({ type: DirectoryPrefsDto })
  @IsObject({ message: DIRECTORY_MESSAGES.directory })
  @ValidateNested()
  @Type(() => DirectoryPrefsDto)
  directory!: DirectoryPrefsDto;
}
