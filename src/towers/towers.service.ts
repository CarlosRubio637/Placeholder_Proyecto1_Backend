import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { TowerResponseDto } from './dto/index.js';

@Injectable()
export class TowersService {
  constructor(private prisma: PrismaService) {}

  async findAll(): Promise<TowerResponseDto[]> {
    const towers = await this.prisma.tower.findMany({
      orderBy: { letter: 'asc' },
      select: { id: true, name: true, letter: true },
    });

    return towers.map((tower) => ({
      id: tower.id,
      name: tower.name,
      letter: tower.letter,
    }));
  }
}