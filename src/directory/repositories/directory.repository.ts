import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Role, type Prisma } from '@PrismaClient';

export interface DirectoryRow {
  fullName: string;
  unitCode: string | null;
  phone: string;
  email: string;
  showUnit: boolean;
  showPhone: boolean;
  showEmail: boolean;
}

export interface DirectorySearchFilter {
  requesterId: string;
  searchName?: string;
  unit?: { towerId: string; number: string };
  skip: number;
  take: number;
}

const DIRECTORY_SELECT = {
  email: true,
  unit: { select: { code: true } },
  profile: { select: { fullName: true, phone: true } },
  directoryPreference: {
    select: { showUnit: true, showPhone: true, showEmail: true },
  },
} satisfies Prisma.UserSelect;

type DirectoryRecord = Prisma.UserGetPayload<{
  select: typeof DIRECTORY_SELECT;
}>;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function searchWhere(filter: DirectorySearchFilter): Prisma.UserWhereInput {
  return {
    id: { not: filter.requesterId },
    role: Role.RESIDENTE,
    isActive: true,
    directoryPreference: filter.unit
      ? { visible: true, showUnit: true }
      : { visible: true },
    profile:
      filter.searchName === undefined
        ? { isNot: null }
        : { searchName: { contains: escapeLike(filter.searchName) } },
    ...(filter.unit && {
      unit: { towerId: filter.unit.towerId, number: filter.unit.number },
    }),
  };
}

function toRow(record: DirectoryRecord): DirectoryRow {
  if (!record.profile || !record.directoryPreference) {
    throw new Error(`El residente ${record.email} no tiene perfil visible`);
  }
  return {
    fullName: record.profile.fullName,
    unitCode: record.unit?.code ?? null,
    phone: record.profile.phone,
    email: record.email,
    ...record.directoryPreference,
  };
}

@Injectable()
export class DirectoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    filter: DirectorySearchFilter,
  ): Promise<{ rows: DirectoryRow[]; total: number }> {
    const where = searchWhere(filter);
    const [records, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: DIRECTORY_SELECT,
        orderBy: [
          { profile: { searchName: 'asc' } },
          { profile: { fullName: 'asc' } },
          { id: 'asc' },
        ],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows: records.map(toRow), total };
  }
}
