import { ApiProperty } from '@nestjs/swagger';
import { SourceModule, type Notification } from '@PrismaClient';

/** Una notificación de la bandeja (H31). */
export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nueva incidencia INC-2026-00001' })
  title!: string;

  @ApiProperty({
    example: 'La unidad A-101 reportó “Fuga de agua” en Torre A.',
  })
  message!: string;

  @ApiProperty({ enum: SourceModule, example: SourceModule.INCIDENCIAS })
  sourceModule!: SourceModule;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'incident',
    description: 'Tipo del registro de origen, para navegar a su pantalla.',
  })
  referenceType!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  referenceId!: string | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'null = No leída.',
  })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(notification: Notification): NotificationDto {
    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      sourceModule: notification.sourceModule,
      referenceType: notification.referenceType,
      referenceId: notification.referenceId,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}

/** Respuesta 200 de GET /notificaciones. */
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] })
  data!: NotificationDto[];

  @ApiProperty({
    description: 'Total que cumple los filtros (todas las páginas).',
  })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}

/** Respuesta 200 de GET /notificaciones/no-leidas/conteo. */
export class UnreadCountDto {
  @ApiProperty({ example: 3 })
  count!: number;
}

/** Respuesta 200 de PATCH /notificaciones/:id/leida. */
export class NotificationReadDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description:
      'Momento en que se leyó por primera vez; no cambia al marcar de nuevo.',
  })
  readAt!: Date;
}

/** Respuesta 200 de PATCH /notificaciones/leidas. */
export class MarkAllReadDto {
  @ApiProperty({
    example: 5,
    description: 'Cuántas No leídas pasaron a Leída.',
  })
  updated!: number;
}
