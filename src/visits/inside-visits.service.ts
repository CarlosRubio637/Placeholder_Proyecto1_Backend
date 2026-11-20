import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, VisitStatus } from '@PrismaClient';
import type {
  InsideVisitListDto,
  InsideVisitsQueryDto,
} from './dto/inside-visits.dto.js';

const MINUTE_MS = 60 * 1000;

/**
 * Texto de búsqueda con el mismo formato que `searchKey` de Visit (H14):
 * minúsculas, sin tildes y con espacios simples.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minutos completos entre la entrada y ahora (nunca negativo). */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE_MS));
}

/**
 * Portería: quién está dentro (H18). Lista las visitas en estado Dentro sin
 * importar la fecha de entrada, para que una visita sin salida registrada
 * nunca desaparezca de la lista. La consulta usa el índice de Visit que
 * empieza por `status`.
 */
@Injectable()
export class InsideVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: InsideVisitsQueryDto,
    now = new Date(),
  ): Promise<InsideVisitListDto> {
    const { page, pageSize, towerId } = query;
    const search = query.search ? normalizeSearch(query.search) : '';

    const where: Prisma.VisitWhereInput = {
      status: VisitStatus.DENTRO,
      ...(towerId ? { unit: { towerId } } : {}),
      ...(search ? { searchKey: { contains: search } } : {}),
    };

    const [totalInside, total, rows] = await Promise.all([
      this.prisma.visit.count({ where: { status: VisitStatus.DENTRO } }),
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        // Entrada más antigua primero; el id desempata entradas a la misma hora.
        orderBy: [{ entryAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          visitorName: true,
          documentType: true,
          documentNumber: true,
          reason: true,
          entryAt: true,
          unit: { select: { code: true } },
        },
      }),
    ]);

    return {
      totalInside,
      data: rows.map((row) => {
        // Una visita Dentro siempre tiene entryAt (H16); se cubre igual.
        const entryAt = row.entryAt ?? now;
        return {
          id: row.id,
          visitorName: row.visitorName,
          documentType: row.documentType,
          documentNumber: row.documentNumber,
          unitCode: row.unit.code,
          reason: row.reason,
          entryAt,
          minutesInside: minutesBetween(entryAt, now),
        };
      }),
      total,
      page,
      pageSize,
    };
  }
}
