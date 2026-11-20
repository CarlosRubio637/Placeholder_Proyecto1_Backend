import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementCategory, AudienceType } from '@PrismaClient';
import { fromDbDate } from '@Common/time';
import {
  ANNOUNCEMENT_STATUSES,
  type AnnouncementStatus,
} from '../announcements.constants.js';
import type {
  AdminAnnouncementDetailRow,
  AdminAnnouncementRow,
  AnnouncementRecipientRow,
} from '../repositories/index.js';
import { AnnouncementTowerDto } from './announcement-response.dto.js';

export function readPercentage(
  readCount: number,
  recipientCount: number,
): number {
  if (recipientCount === 0) return 0;
  return Math.round((readCount * 1000) / recipientCount) / 10;
}

export class AdminAnnouncementSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Mantenimiento de ascensores' })
  title!: string;

  @ApiProperty({ enum: AnnouncementCategory })
  category!: AnnouncementCategory;

  @ApiProperty({ enum: AudienceType })
  audience!: AudienceType;

  @ApiProperty({
    type: [AnnouncementTowerDto],
    description: 'Torres de la audiencia, vacío con TODOS.',
  })
  towers!: AnnouncementTowerDto[];

  @ApiProperty({ example: '2026-11-10T15:30:00.000Z' })
  publishedAt!: Date;

  @ApiProperty({ example: '2026-11-20' })
  expiresOn!: string;

  @ApiProperty({
    enum: ANNOUNCEMENT_STATUSES,
    description:
      'VIGENTE hasta el día de expiresOn, con la fecha de El Salvador.',
  })
  status!: AnnouncementStatus;

  @ApiProperty({ example: 3, description: 'Destinatarios con readAt.' })
  readCount!: number;

  @ApiProperty({ example: 12, description: 'Destinatarios al publicar.' })
  recipientCount!: number;

  @ApiProperty({
    example: 25,
    description: 'Con un decimal; 0 sin destinatarios.',
  })
  readPct!: number;

  static fromRow(
    row: AdminAnnouncementRow,
    today: string,
  ): AdminAnnouncementSummaryDto {
    const expiresOn = fromDbDate(row.expiresOn);
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      audience: row.audience,
      towers: row.towers.map(({ id, name }) => ({ id, name })),
      publishedAt: row.publishedAt,
      expiresOn,
      status: expiresOn >= today ? 'VIGENTE' : 'ARCHIVADO',
      readCount: row.readCount,
      recipientCount: row.recipientCount,
      readPct: readPercentage(row.readCount, row.recipientCount),
    };
  }
}

export class AdminAnnouncementDetailDto extends AdminAnnouncementSummaryDto {
  @ApiProperty({ example: 'El lunes no habrá servicio de ascensores.' })
  body!: string;

  static fromDetail(
    row: AdminAnnouncementDetailRow,
    today: string,
  ): AdminAnnouncementDetailDto {
    return Object.assign(AdminAnnouncementSummaryDto.fromRow(row, today), {
      body: row.body,
    });
  }
}

export class AdminAnnouncementPageDto {
  @ApiProperty({ type: [AdminAnnouncementSummaryDto] })
  data!: AdminAnnouncementSummaryDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}

export class AnnouncementRecipientDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ana Gómez',
    description: 'null si el usuario no tiene perfil.',
  })
  fullName!: string | null;

  @ApiProperty({ example: 'B-101' })
  unitCode!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    example: null,
    description: 'Primera lectura; null = No leído.',
  })
  readAt!: Date | null;

  static fromRow(row: AnnouncementRecipientRow): AnnouncementRecipientDto {
    return {
      fullName: row.fullName,
      unitCode: row.unitCode,
      readAt: row.readAt,
    };
  }
}

export class AnnouncementReadsPageDto {
  @ApiProperty({ type: AdminAnnouncementDetailDto })
  announcement!: AdminAnnouncementDetailDto;

  @ApiProperty({ type: [AnnouncementRecipientDto] })
  data!: AnnouncementRecipientDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;
}
