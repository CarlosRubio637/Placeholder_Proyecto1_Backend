import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Quita espacios al inicio y al final. Evita títulos u opciones de "   ". */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Igual que `trim`, pero para un arreglo de textos (las opciones del tema). */
const trimAll = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;


class AssemblyTopicDto {
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @Transform(trimAll)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  options: string[];
}

/** Cuerpo de POST y de PUT /admin/asambleas (el PUT lleva el cuerpo completo). */
export class CreateAssemblyDto {
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  title: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AssemblyTopicDto)
  topics: AssemblyTopicDto[];
}