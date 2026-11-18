import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  Length,
  Matches,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';
import { DocumentType } from '@PrismaClient';
// Reutiliza las mismas expresiones y función de limpieza que H14 (visitas),
// para que un DUI o pasaporte valide igual en toda la aplicación.
import {
  DUI_REGEX,
  NAME_REGEX,
  PASSPORT_REGEX,
} from '../../visits/visits.constants.js';
import { cleanName } from '../../visits/visits.utils.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Mensajes exactos de la historia H21. */
export const DELIVERY_MESSAGES = {
  name: 'Ingresa el nombre de quien recoge (3 a 80 letras).',
  documentType: 'Selecciona el tipo de documento (DUI o Pasaporte).',
  dui: 'Ingresa el DUI con el formato 00000000-0.',
  passport: 'Ingresa un pasaporte de 6 a 12 letras o números.',
  alreadyDelivered: (date: string, name: string) =>
    `Este paquete ya fue entregado el ${date} a ${name}.`,
  notFound: 'El paquete no existe.',
} as const;

/**
 * Valida el número de documento según el tipo elegido: DUI con formato
 * 00000000-0 o pasaporte de 6 a 12 letras o números. Si el tipo no es válido,
 * el error se muestra en el campo del tipo, no acá.
 */
function IsDocumentNumber() {
  return ValidateBy({
    name: 'isDocumentNumber',
    validator: {
      validate(value: unknown, args: ValidationArguments) {
        const { pickedUpByDocType } = args.object as DeliverPackageDto;
        if (typeof value !== 'string') return false;
        if (pickedUpByDocType === DocumentType.DUI) return DUI_REGEX.test(value);
        if (pickedUpByDocType === DocumentType.PASAPORTE)
          return PASSPORT_REGEX.test(value);
        return true;
      },
      defaultMessage(args?: ValidationArguments) {
        const { pickedUpByDocType } = (args?.object ?? {}) as DeliverPackageDto;
        return pickedUpByDocType === DocumentType.PASAPORTE
          ? DELIVERY_MESSAGES.passport
          : DELIVERY_MESSAGES.dui;
      },
    },
  });
}

/** Cuerpo de POST /seguridad/paquetes/:id/entrega (H21). */
export class DeliverPackageDto {
  @ApiProperty({ example: 'Ana María López', minLength: 3, maxLength: 80 })
  @Transform(({ value }) =>
    typeof value === 'string' ? cleanName(value) : value,
  )
  @IsString({ message: DELIVERY_MESSAGES.name })
  @Length(3, 80, { message: DELIVERY_MESSAGES.name })
  @Matches(NAME_REGEX, { message: DELIVERY_MESSAGES.name })
  pickedUpByName!: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.DUI })
  @IsEnum(DocumentType, { message: DELIVERY_MESSAGES.documentType })
  pickedUpByDocType!: DocumentType;

  @ApiProperty({
    example: '01234567-8',
    description: 'DUI 00000000-0 o pasaporte de 6 a 12 letras o números.',
  })
  @Transform(trim)
  @IsDocumentNumber()
  pickedUpByDocNumber!: string;
}
