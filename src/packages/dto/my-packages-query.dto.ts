import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PackageStatus } from '@PrismaClient';

export const MY_PACKAGES_PAGE_SIZE = 10;
export const MY_PACKAGES_MAX_PAGE_SIZE = 100;

// H20 toma la unidad del token; la consulta NO acepta unitId. Se declara aquí
// solo para que forbidNonWhitelisted del main.ts devuelva 400 si llega.
export class MyPackagesQueryDto {
  @ApiProperty({ enum: PackageStatus, required: true })
  @IsEnum(PackageStatus, {
    message: 'El estado debe ser PENDIENTE_ENTREGA o ENTREGADO.',
  })
  status!: PackageStatus;

  @ApiProperty({ minimum: 1, default: 1, required: false })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'page debe ser un número entero mayor o igual a 1.' })
  @Min(1, { message: 'page debe ser un número entero mayor o igual a 1.' })
  page?: number;

  @ApiProperty({
    minimum: 1,
    maximum: MY_PACKAGES_MAX_PAGE_SIZE,
    default: MY_PACKAGES_PAGE_SIZE,
    required: false,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({
    message: `pageSize debe ser un entero entre 1 y ${MY_PACKAGES_MAX_PAGE_SIZE}.`,
  })
  @Min(1, {
    message: `pageSize debe ser un entero entre 1 y ${MY_PACKAGES_MAX_PAGE_SIZE}.`,
  })
  @Max(MY_PACKAGES_MAX_PAGE_SIZE, {
    message: `pageSize debe ser un entero entre 1 y ${MY_PACKAGES_MAX_PAGE_SIZE}.`,
  })
  pageSize?: number;
}
