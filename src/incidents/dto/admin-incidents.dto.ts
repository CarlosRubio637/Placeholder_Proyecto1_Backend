import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  IncidentLocation,
  IncidentPriority,
  IncidentStatus,
} from '@PrismaClient';

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 50;
export const SEARCH_MAX = 80;

/** Mensajes de H12. */
export const ADMIN_INCIDENT_MESSAGES = {
  status: 'El estado no es válido.',
  priority: 'La prioridad debe ser Baja, Media o Alta.',
  location: 'La ubicación no es válida.',
  assigneeFilter: 'El responsable debe ser un uuid o "none".',
  search: `La búsqueda puede tener máximo ${SEARCH_MAX} caracteres.`,
  page: 'La página debe ser un número entero mayor o igual a 1.',
  pageSize: `El tamaño de página debe estar entre 1 y ${ADMIN_MAX_PAGE_SIZE}.`,
  assigneeId: 'El responsable no existe o está inactivo.',
  nothingToChange: 'Indica la prioridad o el responsable.',
  resolved: 'La incidencia está resuelta. Reábrela para modificarla.',
  notFound: 'La incidencia no existe.',
} as const;

const M = ADMIN_INCIDENT_MESSAGES;

/** Consulta de GET /admin/incidencias (H12). */
export class AdminIncidentsQuery {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus, { message: M.status })
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentPriority })
  @IsOptional()
  @IsEnum(IncidentPriority, { message: M.priority })
  priority?: IncidentPriority;

  @ApiPropertyOptional({ enum: IncidentLocation })
  @IsOptional()
  @IsEnum(IncidentLocation, { message: M.location })
  location?: IncidentLocation;

  @ApiPropertyOptional({
    description: 'Id del responsable, o "none" para las que no tienen.',
  })
  @IsOptional()
  @Matches(
    /^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    { message: M.assigneeFilter },
  )
  assigneeId?: string;

  @ApiPropertyOptional({
    maxLength: SEARCH_MAX,
    description: 'Número o título, sin distinguir mayúsculas ni tildes.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString({ message: M.search })
  @MaxLength(SEARCH_MAX, { message: M.search })
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: M.page })
  @Min(1, { message: M.page })
  page: number = 1;

  @ApiPropertyOptional({
    default: ADMIN_PAGE_SIZE,
    minimum: 1,
    maximum: ADMIN_MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: M.pageSize })
  @Min(1, { message: M.pageSize })
  @Max(ADMIN_MAX_PAGE_SIZE, { message: M.pageSize })
  pageSize: number = ADMIN_PAGE_SIZE;
}

/** Cuerpo de PATCH /admin/incidencias/:id (H12). Al menos uno de los dos. */
export class UpdateIncidentDto {
  @ApiPropertyOptional({ enum: IncidentPriority })
  @IsOptional()
  @IsEnum(IncidentPriority, { message: M.priority })
  priority?: IncidentPriority;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null quita el responsable.',
  })
  @ValidateIf((dto: UpdateIncidentDto) => dto.assigneeId !== null)
  @IsOptional()
  @IsUUID('all', { message: M.assigneeId })
  assigneeId?: string | null;
}

export class AssigneeRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Pedro Alvarado' })
  name!: string;
}

/** Fila de la bandeja del administrador (H12). */
export class AdminIncidentItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'INC-2026-00012' })
  number!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ example: 'A-101' })
  unitCode!: string;

  @ApiProperty({ enum: IncidentLocation })
  location!: IncidentLocation;

  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;

  @ApiProperty({ enum: IncidentPriority })
  priority!: IncidentPriority;

  @ApiPropertyOptional({ type: AssigneeRefDto, nullable: true })
  assignee!: AssigneeRefDto | null;

  @ApiProperty({
    example: 3,
    description: 'Días de calendario del condominio desde la creación.',
  })
  daysOpen!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class AdminIncidentListDto {
  @ApiProperty({ type: [AdminIncidentItemDto] })
  data!: AdminIncidentItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

/** Responsable de mantenimiento activo (H12). */
export class MaintenanceStaffDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Pedro Alvarado' })
  name!: string;

  @ApiProperty({ example: 'Fontanería' })
  specialty!: string;

  @ApiProperty({ example: '7200-0001' })
  phone!: string;
}

export class MaintenanceStaffListDto {
  @ApiProperty({ type: [MaintenanceStaffDto] })
  data!: MaintenanceStaffDto[];
}

export class ManagementEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['PRIORIDAD', 'ASIGNACION'] })
  type!: 'PRIORIDAD' | 'ASIGNACION';

  @ApiPropertyOptional({ type: String, nullable: true })
  fromValue!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  toValue!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

/** Respuesta de PATCH /admin/incidencias/:id: la incidencia y su último evento. */
export class IncidentManagementDto {
  @ApiProperty()
  incident!: {
    id: string;
    number: string;
    status: IncidentStatus;
    priority: IncidentPriority;
    assignee: AssigneeRefDto | null;
  };

  @ApiPropertyOptional({
    type: ManagementEventDto,
    nullable: true,
    description: 'null si no cambió nada (los valores ya eran esos).',
  })
  event!: ManagementEventDto | null;
}
