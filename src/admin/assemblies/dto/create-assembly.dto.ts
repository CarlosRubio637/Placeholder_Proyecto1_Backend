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

/** Mismos textos que el formulario del frontend (lib/validation/asamblea.ts). */
export const ASSEMBLY_MESSAGES = {
  title: 'El título debe tener entre 5 y 100 caracteres.',
  description: 'La descripción no puede superar los 1,000 caracteres.',
  startsAt: 'Indica la fecha y hora de inicio.',
  endsAt: 'Indica la fecha y hora de cierre.',
  topics: 'La agenda necesita entre 1 y 10 temas.',
  question: 'La pregunta debe tener entre 5 y 200 caracteres.',
  options: 'Cada tema necesita entre 2 y 6 opciones distintas.',
  option: 'Cada opción debe tener entre 1 y 80 caracteres.',
} as const;

const M = ASSEMBLY_MESSAGES;

class AssemblyTopicDto {
  @Transform(trim)
  @IsString({ message: M.question })
  @MinLength(5, { message: M.question })
  @MaxLength(200, { message: M.question })
  question: string;

  @IsArray({ message: M.options })
  @ArrayMinSize(2, { message: M.options })
  @ArrayMaxSize(6, { message: M.options })
  @Transform(trimAll)
  @IsString({ each: true, message: M.option })
  @MinLength(1, { each: true, message: M.option })
  @MaxLength(80, { each: true, message: M.option })
  options: string[];
}

/** Cuerpo de POST y de PUT /admin/asambleas (el PUT lleva el cuerpo completo). */
export class CreateAssemblyDto {
  @Transform(trim)
  @IsString({ message: M.title })
  @MinLength(5, { message: M.title })
  @MaxLength(100, { message: M.title })
  title: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: M.description })
  @MaxLength(1000, { message: M.description })
  description?: string;

  @IsDateString({}, { message: M.startsAt })
  startsAt: string;

  @IsDateString({}, { message: M.endsAt })
  endsAt: string;

  @IsArray({ message: M.topics })
  @ArrayMinSize(1, { message: M.topics })
  @ArrayMaxSize(10, { message: M.topics })
  @ValidateNested({ each: true, message: M.topics })
  @Type(() => AssemblyTopicDto)
  topics: AssemblyTopicDto[];
}
