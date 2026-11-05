import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cuerpo de POST /auth/registro (H38). Las reglas coinciden con las del
 * formulario "Crear cuenta" del frontend (lib/validation/registro.ts).
 *
 * No tiene campo `role`: el ValidationPipe global usa forbidNonWhitelisted,
 * así que si el cliente lo manda, la request se rechaza con 400.
 */
export class RegistroDto {
  @ApiProperty({ example: 'Ana María López', minLength: 2, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @Length(2, 80, { message: 'El nombre debe tener de 2 a 80 caracteres.' })
  @Matches(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/, {
    message: 'El nombre solo admite letras, espacios, apóstrofo y guion.',
  })
  @Matches(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/, {
    message: 'El nombre solo admite letras, espacios, apóstrofo y guion.',
  })
  fullName!: string;

  @ApiProperty({ example: 'ana.lopez@correo.com', format: 'email', maxLength: 254 })
  @IsNormalizedEmail()
  email!: string;

  @ApiProperty({ example: '7845-1290', description: 'Formato 0000-0000.' })
  @Transform(trim)
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, { message: 'El teléfono debe tener el formato 0000-0000.' })
  phone!: string;

  @ApiProperty({
    example: 'K7H2M9QX',
    description: 'Código de registro de 8 caracteres que entrega la administración.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9]{8}$/, {
    message: 'El código de unidad tiene 8 caracteres en mayúsculas.',
  })
  unitCode!: string;

  @ApiProperty({
    description: 'Debe incluir al menos una minúscula, una mayúscula y un número.',
    example: 'Prueba2026',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  // bcrypt trunca silenciosamente en 72 bytes, así que se rechaza antes de hashear.
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir al menos una minúscula, una mayúscula y un número.',
  })
  password!: string;
}
