import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsString,
  Length,
  Matches,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';
import { DocumentType } from '@PrismaClient';
import {
  DUI_REGEX,
  NAME_REGEX,
  PASSPORT_REGEX,
  VISIT_MESSAGES,
} from '../visits.constants.js';
import { cleanName } from '../visits.utils.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * El número de documento según su tipo: DUI 00000000-0 o pasaporte de 6 a 12
 * letras o números. Sin un tipo válido, el error es solo el del tipo.
 */
function IsDocumentNumber() {
  return ValidateBy({
    name: 'isDocumentNumber',
    validator: {
      validate(value: unknown, args: ValidationArguments) {
        const { documentType } = args.object as CreateVisitDto;
        if (typeof value !== 'string') return false;
        if (documentType === DocumentType.DUI) return DUI_REGEX.test(value);
        if (documentType === DocumentType.PASAPORTE)
          return PASSPORT_REGEX.test(value);
        return true;
      },
      defaultMessage(args?: ValidationArguments) {
        const { documentType } = (args?.object ?? {}) as CreateVisitDto;
        return documentType === DocumentType.PASAPORTE
          ? VISIT_MESSAGES.passport
          : VISIT_MESSAGES.dui;
      },
    },
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Cuerpo de POST /visitas (H14). El formato de cada campo se valida aquí;
 * las reglas que dependen de la fecha de hoy (rango de fechas, hora pasada,
 * horario de 06:00 a 22:00) las valida el servicio.
 */
export class CreateVisitDto {
  @ApiProperty({ example: 'Ana María López', minLength: 3, maxLength: 80 })
  @Transform(({ value }) =>
    typeof value === 'string' ? cleanName(value) : value,
  )
  @IsString({ message: VISIT_MESSAGES.name })
  @Length(3, 80, { message: VISIT_MESSAGES.name })
  @Matches(NAME_REGEX, { message: VISIT_MESSAGES.name })
  visitorName!: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.DUI })
  @IsEnum(DocumentType, { message: VISIT_MESSAGES.documentType })
  documentType!: DocumentType;

  @ApiProperty({
    example: '01234567-8',
    description: 'DUI 00000000-0 o pasaporte de 6 a 12 letras o números.',
  })
  @Transform(trim)
  @IsDocumentNumber()
  documentNumber!: string;

  @ApiProperty({
    example: '2026-11-10',
    description: 'AAAA-MM-DD, de hoy a hoy + 30 días.',
  })
  @Matches(DATE_ONLY, { message: VISIT_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: VISIT_MESSAGES.dateFormat })
  visitDate!: string;

  @ApiProperty({
    example: '15:30',
    description:
      'HH:mm de 06:00 a 22:00 en pasos de 15 minutos; si es hoy, no anterior a la hora actual.',
  })
  @Matches(TIME_HH_MM, { message: VISIT_MESSAGES.hours })
  expectedTime!: string;

  @ApiProperty({ example: 'Visita familiar', minLength: 5, maxLength: 100 })
  @Transform(trim)
  @IsString({ message: VISIT_MESSAGES.reason })
  @Length(5, 100, { message: VISIT_MESSAGES.reason })
  reason!: string;
}
