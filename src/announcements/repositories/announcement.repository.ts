import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Role,
  type Announcement,
  type AnnouncementCategory,
  type AudienceType,
  type Prisma,
} from '@PrismaClient';
import type { AnnouncementStatus } from '../announcements.constants.js';
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

export type AdminAnnouncementRow = Pick<
  Announcement,
  'id' | 'title' | 'category' | 'audience' | 'publishedAt' | 'expiresOn'
> & {
  towers: { id: string; name: string }[];
  readCount: number;
  recipientCount: number;
};

export type AdminAnnouncementDetailRow = AdminAnnouncementRow & {
  body: string;
};

export interface AdminAnnouncementFilter {
  status?: AnnouncementStatus;
  category?: AnnouncementCategory;
  today: Date;
  skip: number;
  take: number;
}

export interface AnnouncementRecipientRow {
  fullName: string | null;
  unitCode: string;
  readAt: Date | null;
}

export interface AnnouncementReadsFilter {
  read?: boolean;
  skip: number;
  take: number;
}

export interface AnnouncementReads {
  announcement: AdminAnnouncementDetailRow;
  recipients: AnnouncementRecipientRow[];
  total: number;
}

const EXPIRY_BY_STATUS: Record<
  AnnouncementStatus,
  (today: Date) => Prisma.DateTimeFilter
> = {
  VIGENTE: (today) => ({ gte: today }),
  ARCHIVADO: (today) => ({ lt: today }),
};

const ADMIN_ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  category: true,
  audience: true,
  publishedAt: true,
  expiresOn: true,
  towers: {
    select: { tower: { select: { id: true, name: true } } },
    orderBy: { tower: { letter: 'asc' } },
  },
} satisfies Prisma.AnnouncementSelect;

type AdminAnnouncementRecord = Prisma.AnnouncementGetPayload<{
  select: typeof ADMIN_ANNOUNCEMENT_SELECT;
}>;

interface ReadCounts {
  readCount: number;
  recipientCount: number;
}

const NO_RECIPIENTS: ReadCounts = { readCount: 0, recipientCount: 0 };

function toAdminRow(
  record: AdminAnnouncementRecord,
  counts: ReadCounts,
): AdminAnnouncementRow {
  return {
    ...record,
    towers: record.towers.map(({ tower }) => ({
      id: tower.id,
      name: tower.name,
    })),
    ...counts,
  };
}

function readAtFilter(
  read: boolean | undefined,
): Prisma.DateTimeNullableFilter | null | undefined {
  if (read === undefined) return undefined;
  return read ? { not: null } : null;
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

  async listForAdmin(
    filter: AdminAnnouncementFilter,
  ): Promise<{ rows: AdminAnnouncementRow[]; total: number }> {
    const where: Prisma.AnnouncementWhereInput = {
      expiresOn: filter.status
        ? EXPIRY_BY_STATUS[filter.status](filter.today)
        : undefined,
      category: filter.category,
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        select: ADMIN_ANNOUNCEMENT_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    const counts = await this.countReads(records.map((record) => record.id));
    return {
      rows: records.map((record) =>
        toAdminRow(record, counts.get(record.id) ?? NO_RECIPIENTS),
      ),
      total,
    };
  }

  async findForReads(
    announcementId: string,
    filter: AnnouncementReadsFilter,
  ): Promise<AnnouncementReads> {
    const record = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { ...ADMIN_ANNOUNCEMENT_SELECT, body: true },
    });
    if (!record) throw new AnnouncementNotFoundError(announcementId);

    const where: Prisma.AnnouncementRecipientWhereInput = {
      announcementId,
      readAt: readAtFilter(filter.read),
    };
    const [recipients, total] = await this.prisma.$transaction([
      this.prisma.announcementRecipient.findMany({
        where,
        select: {
          readAt: true,
          unit: { select: { code: true } },
          user: { select: { profile: { select: { fullName: true } } } },
        },
        orderBy: [
          { unit: { code: 'asc' } },
          { user: { profile: { fullName: 'asc' } } },
          { id: 'asc' },
        ],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.announcementRecipient.count({ where }),
    ]);
    const counts = await this.countReads([announcementId]);
    const { body, ...summary } = record;
    return {
      announcement: {
        ...toAdminRow(summary, counts.get(announcementId) ?? NO_RECIPIENTS),
        body,
      },
      recipients: recipients.map((recipient) => ({
        fullName: recipient.user.profile?.fullName ?? null,
        unitCode: recipient.unit.code,
        readAt: recipient.readAt,
      })),
      total,
    };
  }

  private async countReads(
    announcementIds: string[],
  ): Promise<Map<string, ReadCounts>> {
    if (announcementIds.length === 0) return new Map();
    const groups = await this.prisma.announcementRecipient.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: announcementIds } },
      _count: { _all: true, readAt: true },
    });
    return new Map(
      groups.map((group) => [
        group.announcementId,
        { readCount: group._count.readAt, recipientCount: group._count._all },
      ]),
    );
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
