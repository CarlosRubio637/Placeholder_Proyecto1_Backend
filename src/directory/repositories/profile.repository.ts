import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import { ProfileNotFoundError } from '../errors/index.js';

type Db = Prisma.TransactionClient | PrismaService;

export interface DirectoryPrefs {
  visible: boolean;
  showName: boolean;
  showUnit: boolean;
  showPhone: boolean;
  showEmail: boolean;
}

export interface ResidentProfile {
  fullName: string;
  email: string;
  unitCode: string | null;
  phone: string;
  directory: DirectoryPrefs;
}

const HIDDEN: DirectoryPrefs = {
  visible: false,
  showName: false,
  showUnit: false,
  showPhone: false,
  showEmail: false,
};

const PREFS_SELECT = {
  visible: true,
  showName: true,
  showUnit: true,
  showPhone: true,
  showEmail: true,
} satisfies Prisma.DirectoryPreferenceSelect;

async function readProfile(db: Db, userId: string): Promise<ResidentProfile> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      unit: { select: { code: true } },
      profile: { select: { fullName: true, phone: true } },
      directoryPreference: { select: PREFS_SELECT },
    },
  });
  if (!user?.profile) {
    throw new ProfileNotFoundError(userId);
  }
  return {
    fullName: user.profile.fullName,
    email: user.email,
    unitCode: user.unit?.code ?? null,
    phone: user.profile.phone,
    directory: user.directoryPreference ?? HIDDEN,
  };
}

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<ResidentProfile> {
    return readProfile(this.prisma, userId);
  }

  save(
    userId: string,
    phone: string,
    prefs: DirectoryPrefs,
  ): Promise<ResidentProfile> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.profile.updateMany({
        where: { userId },
        data: { phone },
      });
      if (count === 0) {
        throw new ProfileNotFoundError(userId);
      }
      await tx.directoryPreference.upsert({
        where: { userId },
        create: { userId, ...prefs },
        update: prefs,
      });
      return readProfile(tx, userId);
    });
  }
}
