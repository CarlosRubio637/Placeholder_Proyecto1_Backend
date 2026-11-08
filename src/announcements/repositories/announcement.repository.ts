import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Role,
  type Announcement,
  type AnnouncementCategory,
  type AudienceType,
  type Prisma,
} from '@PrismaClient';
import {
  AnnouncementNotFoundError,
  TowerNotFoundError,
} from '../errors/index.js';

type Tx = Prisma.TransactionClient;

export interface PublishAnnouncementData {
  title: string;
  body: string;
  category: AnnouncementCategory;
  audience: AudienceType;
  towerIds: string[];
  expiresOn: Date;
  createdById: string;
}

export type PublishedAnnouncement = Announcement & {
  towers: { id: string; name: string; letter: string }[];
  recipientCount: number;
};

export interface ResidentAnnouncementRow {
  readAt: Date | null;
  announcement: Pick<
    Announcement,
    'id' | 'title' | 'category' | 'publishedAt' | 'expiresOn'
  >;
}

export interface ResidentAnnouncementFilter {
  archived: boolean;
  category?: AnnouncementCategory;
  today: Date;
  skip: number;
  take: number;
}

export interface ResidentAnnouncementDetail {
  readAt: Date;
  announcement: Pick<
    Announcement,
    'id' | 'title' | 'body' | 'category' | 'publishedAt' | 'expiresOn'
  >;
}

function recipientFilter(towerIds: string[]): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {
    role: Role.RESIDENTE,
    isActive: true,
    unitId: { not: null },
  };
  return towerIds.length === 0
    ? base
    : { ...base, unit: { towerId: { in: towerIds } } };
}

@Injectable()
export class AnnouncementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countRecipients(towerIds: string[] | undefined): Promise<number> {
    const ids = towerIds ?? [];
    await this.assertTowersExist(this.prisma, ids);
    return this.prisma.user.count({ where: recipientFilter(ids) });
  }

  publish(data: PublishAnnouncementData): Promise<PublishedAnnouncement> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertTowersExist(tx, data.towerIds);

      const residents = await tx.user.findMany({
        where: recipientFilter(data.towerIds),
        select: { id: true, unitId: true },
      });

      const { towerIds, ...fields } = data;
      const announcement = await tx.announcement.create({
        data: {
          ...fields,
          towers: { create: towerIds.map((towerId) => ({ towerId })) },
        },
        include: {
          towers: {
            select: {
              tower: { select: { id: true, name: true, letter: true } },
            },
            orderBy: { tower: { letter: 'asc' } },
          },
        },
      });

      const { count } = await tx.announcementRecipient.createMany({
        data: residents.map((resident) => ({
          announcementId: announcement.id,
          userId: resident.id,
          unitId: resident.unitId as string,
        })),
      });

      return {
        ...announcement,
        towers: announcement.towers.map(({ tower }) => tower),
        recipientCount: count,
      };
    });
  }

  async listForResident(
    userId: string,
    filter: ResidentAnnouncementFilter,
  ): Promise<{ rows: ResidentAnnouncementRow[]; total: number }> {
    const where: Prisma.AnnouncementRecipientWhereInput = {
      userId,
      announcement: {
        expiresOn: filter.archived
          ? { lt: filter.today }
          : { gte: filter.today },
        category: filter.category,
      },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.announcementRecipient.findMany({
        where,
        select: {
          readAt: true,
          announcement: {
            select: {
              id: true,
              title: true,
              category: true,
              publishedAt: true,
              expiresOn: true,
            },
          },
        },
        orderBy: [
          { announcement: { publishedAt: 'desc' } },
          { announcement: { id: 'asc' } },
        ],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.announcementRecipient.count({ where }),
    ]);
    return { rows, total };
  }

  async markRead(
    userId: string,
    announcementId: string,
  ): Promise<ResidentAnnouncementDetail> {
    await this.prisma.announcementRecipient.updateMany({
      where: { announcementId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const recipient = await this.prisma.announcementRecipient.findUnique({
      where: { announcementId_userId: { announcementId, userId } },
      select: {
        readAt: true,
        announcement: {
          select: {
            id: true,
            title: true,
            body: true,
            category: true,
            publishedAt: true,
            expiresOn: true,
          },
        },
      },
    });
    if (!recipient?.readAt) throw new AnnouncementNotFoundError(announcementId);
    return { readAt: recipient.readAt, announcement: recipient.announcement };
  }

  private async assertTowersExist(
    client: Tx | PrismaService,
    towerIds: string[],
  ): Promise<void> {
    if (towerIds.length === 0) return;
    const found = await client.tower.findMany({
      where: { id: { in: towerIds } },
      select: { id: true },
    });
    const existing = new Set(found.map((tower) => tower.id));
    const missing = towerIds.find((id) => !existing.has(id));
    if (missing) throw new TowerNotFoundError(missing);
  }
}
