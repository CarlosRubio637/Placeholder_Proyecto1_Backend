import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { UnitResponseDto } from './dto/index.js';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findByTower(towerId: string): Promise<UnitResponseDto[]> {
    const units = await this.prisma.unit.findMany({
      where: { towerId },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, number: true },
    });

    return units.map((unit) => ({
      id: unit.id,
      code: unit.code,
      number: unit.number,
    }));
  }
}