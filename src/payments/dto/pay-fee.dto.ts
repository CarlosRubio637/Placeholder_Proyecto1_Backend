import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { PAYMENT_MESSAGES } from '../payments.constants.js';

const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

/** Cuerpo de POST /cuotas/:cuotaId/pagos (H1). */
export class PayFeeDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Generada al abrir la pantalla; evita cobros repetidos.',
  })
  @IsUUID('all', { message: PAYMENT_MESSAGES.idempotencyKey })
  idempotencyKey!: string;

  @ApiProperty({
    example: '4242424242424242',
    description: '16 dígitos. Solo se guardan los últimos 4.',
  })
  @Transform(digitsOnly)
  @IsString({ message: PAYMENT_MESSAGES.cardNumber })
  @Matches(/^\d{16}$/, { message: PAYMENT_MESSAGES.cardNumber })
  cardNumber!: string;

  @ApiProperty({ example: 12, minimum: 1, maximum: 12 })
  @IsInt({ message: PAYMENT_MESSAGES.expiry })
  @Min(1, { message: PAYMENT_MESSAGES.expiry })
  @Max(12, { message: PAYMENT_MESSAGES.expiry })
  expMonth!: number;

  @ApiProperty({ example: 2030, minimum: 2026, maximum: 2040 })
  @IsInt({ message: PAYMENT_MESSAGES.expiry })
  @Min(2026, { message: PAYMENT_MESSAGES.expiry })
  @Max(2040, { message: PAYMENT_MESSAGES.expiry })
  expYear!: number;

  @ApiProperty({ example: '123', description: '3 dígitos. Nunca se guarda.' })
  @IsString({ message: PAYMENT_MESSAGES.cvv })
  @Matches(/^\d{3}$/, { message: PAYMENT_MESSAGES.cvv })
  cvv!: string;

  @ApiProperty({ example: 'Ana Lopez', minLength: 3, maxLength: 60 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: PAYMENT_MESSAGES.holderName })
  @Matches(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{3,60}$/, {
    message: PAYMENT_MESSAGES.holderName,
  })
  holderName!: string;
}
