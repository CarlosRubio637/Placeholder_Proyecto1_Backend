import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { UnitResponseDto } from './dto/index.js';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Unidades de una torre, ordenadas por código. H16 agrega `residentCount`
   * (residentes activos); la respuesta sigue siendo una lista para no romper
   * la pantalla de paquetería (H19).
   */
  async findByTower(towerId: string): Promise<UnitResponseDto[]> {
    const units = await this.prisma.unit.findMany({
      where: { towerId },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        number: true,
        _count: { select: { residents: { where: { isActive: true } } } },
      },
    });

    return units.map((unit) => ({
      id: unit.id,
      code: unit.code,
      number: unit.number,
      residentCount: unit._count.residents,
    }));
  }
}
