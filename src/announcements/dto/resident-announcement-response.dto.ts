import { ApiProperty } from '@nestjs/swagger';
import { AnnouncementCategory } from '@PrismaClient';
import { fromDbDate } from '@Common/time';
import type {
  ResidentAnnouncementDetail,
  ResidentAnnouncementRow,
} from '../repositories/index.js';

export class ResidentAnnouncementSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Corte de agua el 4 de noviembre' })
  title!: string;

  @ApiProperty({ enum: AnnouncementCategory })
  category!: AnnouncementCategory;

  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  publishedAt!: Date;

  @ApiProperty({ example: '2026-11-14' })
  expiresOn!: string;

  @ApiProperty({
    type: Date,
    nullable: true,
    example: null,
    description: 'Primera lectura del residente; null = No leído.',
  })
  readAt!: Date | null;

  static fromRow(row: ResidentAnnouncementRow): ResidentAnnouncementSummaryDto {
    const { announcement } = row;
    return {
      id: announcement.id,
      title: announcement.title,
      category: announcement.category,
      publishedAt: announcement.publishedAt,
      expiresOn: fromDbDate(announcement.expiresOn),
      readAt: row.readAt,
    };
  }
}

export class ResidentAnnouncementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Corte de agua el 4 de noviembre' })
  title!: string;

  @ApiProperty({ example: 'No habrá agua de 08:00 a 16:00 en la Torre A.' })
  body!: string;

  @ApiProperty({ enum: AnnouncementCategory })
  category!: AnnouncementCategory;

  @ApiProperty({ example: '2026-11-07T15:30:00.000Z' })
  publishedAt!: Date;

  @ApiProperty({ example: '2026-11-14' })
  expiresOn!: string;

  @ApiProperty({ example: '2026-11-08T16:15:00.000Z' })
  readAt!: Date;

  static fromDetail(
    detail: ResidentAnnouncementDetail,
  ): ResidentAnnouncementDto {
    const { announcement } = detail;
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      publishedAt: announcement.publishedAt,
      expiresOn: fromDbDate(announcement.expiresOn),
      readAt: detail.readAt,
    };
  }
}

export class ResidentAnnouncementPageDto {
  @ApiProperty({ type: [ResidentAnnouncementSummaryDto] })
  data!: ResidentAnnouncementSummaryDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  pageSize!: number;
}
