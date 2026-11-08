import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { badRequest } from '@Common/validation';
import { PrismaService } from '@Prisma/services';
import type { AssemblyStatus } from '@PrismaClient';
import { CreateAssemblyDto } from './dto/create-assembly.dto.js';
import { ListAssembliesQueryDto } from './dto/list-assemblies-query.dto.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const MSG_STARTED = 'La asamblea ya inició; no se puede modificar.';
const MSG_NOT_FOUND = 'La asamblea no existe.';

/**
 * Temas y opciones siempre ordenados. Sin `orderBy`, Postgres no garantiza el
 * orden y la pantalla podría mostrar las opciones revueltas.
 */
const TOPICS_INCLUDE = {
  topics: {
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  },
} as const;

/** Forma mínima de una asamblea con sus temas (lo que devuelve Prisma). */
interface AssemblyRow {
  id: string;
  title: string;
  description: string | null;
  status: AssemblyStatus;
  startsAt: Date;
  endsAt: Date;
  topics: {
    id: string;
    question: string;
    options: { id: string; text: string }[];
  }[];
}

@Injectable()
export class AssembliesService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Crear
  // -------------------------------------------------------------------------
  async create(dto: CreateAssemblyDto, adminId: string) {
    this.assertValidRules(dto);

    const created = await this.prisma.assembly.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        createdById: adminId,
        topics: { create: this.buildTopics(dto) },
      },
      include: TOPICS_INCLUDE,
    });

    return this.toDetail(created, null);
  }

  // -------------------------------------------------------------------------
  // Listar (GET /admin/asambleas)
  // -------------------------------------------------------------------------
  async findAll(query: ListAssembliesQueryDto) {
    const { page, pageSize, status } = query;
    const where = status ? { status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.assembly.findMany({
        where,
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { topics: true } } },
      }),
      this.prisma.assembly.count({ where }),
    ]);

    // H23: unidades distintas que han votado al menos un tema de cada
    // asamblea. Se lee aquí (y no en la consulta principal) porque Prisma
    // no deja contar distinct sobre una relación anidada en `_count`.
    const votedMap = await this.countVotedUnits(rows.map((row) => row.id));

    const data = rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      topicCount: row._count.topics,
      votedUnits: votedMap.get(row.id) ?? 0,
    }));

    return { data, total, page, pageSize };
  }

  // -------------------------------------------------------------------------
  // Detalle (GET /admin/asambleas/:id)
  // -------------------------------------------------------------------------
  async findOne(id: string) {
    const row = await this.prisma.assembly.findUnique({
      where: { id },
      include: {
        ...TOPICS_INCLUDE,
        _count: { select: { eligibleUnits: true } },
      },
    });
    if (!row) throw new NotFoundException(MSG_NOT_FOUND);

    // Las unidades habilitadas se fijan al abrir: antes de eso es null.
    const eligibleUnits =
      row.status === 'PROGRAMADA' ? null : row._count.eligibleUnits;

    return this.toDetail(row, eligibleUnits);
  }

  // -------------------------------------------------------------------------
  // Editar (PUT /admin/asambleas/:id)
  // -------------------------------------------------------------------------
  async update(id: string, dto: CreateAssemblyDto) {
    // Chequeo rápido para dar el 404/409 sin abrir una transacción.
    const current = await this.prisma.assembly.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException(MSG_NOT_FOUND);
    if (current.status !== 'PROGRAMADA')
      throw new ConflictException(MSG_STARTED);

    this.assertValidRules(dto);

    return this.prisma.$transaction(async (tx) => {
      // Chequeo DEFINITIVO: el cambio se condiciona por el estado. Si la tarea
      // programada abrió la asamblea entre el chequeo de arriba y este punto,
      // count será 0 y no se toca nada. Además esta fila queda bloqueada hasta
      // el commit, así que la tarea no puede abrirla a medio editar.
      const claimed = await tx.assembly.updateMany({
        where: { id, status: 'PROGRAMADA' },
        data: {
          title: dto.title,
          description: dto.description || null, // null borra la descripción
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
        },
      });
      if (claimed.count === 0) throw new ConflictException(MSG_STARTED);

      // Es seguro reemplazar temas y opciones completos porque en estado
      // Programada no puede haber votos (decisión técnica del PDF).
      await tx.assemblyTopic.deleteMany({ where: { assemblyId: id } });

      const updated = await tx.assembly.update({
        where: { id },
        data: { topics: { create: this.buildTopics(dto) } },
        include: TOPICS_INCLUDE,
      });

      return this.toDetail(updated, null);
    });
  }

  // -------------------------------------------------------------------------
  // Eliminar (DELETE /admin/asambleas/:id)
  // -------------------------------------------------------------------------
  async remove(id: string): Promise<void> {
    // Borrado condicionado por estado en una sola sentencia. Los temas, las
    // opciones y las unidades habilitadas se borran por el onDelete: Cascade.
    const result = await this.prisma.assembly.deleteMany({
      where: { id, status: 'PROGRAMADA' },
    });
    if (result.count > 0) return;

    // No se borró nada: o no existe (404) o ya no estaba Programada (409).
    const exists = await this.prisma.assembly.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(MSG_NOT_FOUND);
    throw new ConflictException(MSG_STARTED);
  }

  // -------------------------------------------------------------------------
  // Utilidades privadas
  // -------------------------------------------------------------------------

  /** Reglas que class-validator no puede expresar (fechas y opciones únicas). */
  private assertValidRules(dto: CreateAssemblyDto): void {
    const startsAt = new Date(dto.startsAt).getTime();
    const endsAt = new Date(dto.endsAt).getTime();

    if (startsAt - Date.now() < HOUR_MS) {
      this.invalid(
        'startsAt',
        'El inicio debe ser al menos 1 hora después de ahora.',
      );
    }

    const duration = endsAt - startsAt;
    if (duration < HOUR_MS || duration > 14 * DAY_MS) {
      this.invalid(
        'endsAt',
        'El cierre debe estar entre 1 hora y 14 días después del inicio.',
      );
    }

    dto.topics.forEach((topic, index) => {
      const normalized = topic.options.map((option) =>
        option.trim().toLowerCase(),
      );
      if (new Set(normalized).size !== normalized.length) {
        this.invalid(
          `topics.${index}.options`,
          'Cada tema necesita entre 2 y 6 opciones distintas.',
        );
      }
    });
  }

  /**
   * 400 con el campo que falló, como pide el PDF. Usa el mismo formato que el
   * ValidationPipe global (`message` como lista) para que toda la API responda igual.
   */
  private invalid(field: string, message: string): never {
    throw badRequest(field, message);
  }

  /** Convierte el DTO en la creación anidada de temas y opciones. */
  private buildTopics(dto: CreateAssemblyDto) {
    return dto.topics.map((topic, topicIndex) => ({
      order: topicIndex + 1,
      question: topic.question,
      options: {
        create: topic.options.map((text, optionIndex) => ({
          order: optionIndex + 1,
          text,
        })),
      },
    }));
  }

  /**
   * H23: cuenta unidades distintas que han votado al menos un tema de cada
   * asamblea. Hace una consulta a `voteParticipation` filtrando por los temas
   * de las asambleas pedidas y agrupa en memoria por asamblea; para 10
   * asambleas por página es intrascendente.
   */
  private async countVotedUnits(
    assemblyIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (assemblyIds.length === 0) return result;

    const participations = await this.prisma.voteParticipation.findMany({
      where: { topic: { assemblyId: { in: assemblyIds } } },
      select: { unitId: true, topic: { select: { assemblyId: true } } },
    });

    // Unidades distintas por asamblea.
    const byAssembly = new Map<string, Set<string>>();
    for (const row of participations) {
      const assemblyId = row.topic.assemblyId;
      let units = byAssembly.get(assemblyId);
      if (!units) {
        units = new Set();
        byAssembly.set(assemblyId, units);
      }
      units.add(row.unitId);
    }
    for (const [assemblyId, units] of byAssembly) {
      result.set(assemblyId, units.size);
    }
    return result;
  }

  /** Respuesta con la forma del PDF (sin campos internos como createdById). */
  private toDetail(row: AssemblyRow, eligibleUnits: number | null) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      topics: row.topics.map((topic) => ({
        id: topic.id,
        question: topic.question,
        options: topic.options.map((option) => ({
          id: option.id,
          text: option.text,
        })),
      })),
      eligibleUnits,
    };
  }
}
