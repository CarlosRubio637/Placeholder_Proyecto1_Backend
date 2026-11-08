import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementCategory, AudienceType } from '@PrismaClient';
import { fromDbDate } from '@Common/time';
import type { PublishedAnnouncement } from '../repositories/index.js';

export class AnnouncementTowerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Torre A' })
  name!: string;
}

export class AnnouncementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Corte de agua el 4 de noviembre' })
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

  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  publishedAt!: Date;

  @ApiProperty({ example: '2026-11-14' })
  expiresOn!: string;

  @ApiProperty({ example: 12 })
  recipientCount!: number;

  static fromEntity(announcement: PublishedAnnouncement): AnnouncementDto {
    return {
      id: announcement.id,
      title: announcement.title,
      category: announcement.category,
      audience: announcement.audience,
      towers: announcement.towers.map(({ id, name }) => ({ id, name })),
      publishedAt: announcement.publishedAt,
      expiresOn: fromDbDate(announcement.expiresOn),
      recipientCount: announcement.recipientCount,
    };
  }
}

export class AudienceCountDto {
  @ApiProperty({ example: 12 })
  recipientCount!: number;
}
