import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Role,
  type Announcement,
  type AnnouncementCategory,
  type AudienceType,
  type Prisma,
} from '@PrismaClient';
import { TowerNotFoundError } from '../errors/index.js';

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
