// Los handlers del controlador se pasan sin llamarlos: RolesGuard y el router
// leen su metadata.
/* oxlint-disable typescript/unbound-method */
import 'reflect-metadata';
import {
  BadRequestException,
  ValidationPipe,
  type ExecutionContext,
  type StreamableFile,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import PDFDocument from 'pdfkit';
import { RolesGuard } from '@Auth/guards';
import { toDbDate } from '@Common/time';
import { validationExceptionFactory } from '@Common/validation';
import type { PrismaService } from '@Prisma/services';
import type { Role, User } from '@PrismaClient';
import type { AreasUsageService } from '../areas-usage.service.js';
import { DelinquencyRepository } from '../delinquency.repository.js';
import { DelinquencyService } from '../delinquency.service.js';
import { DelinquencyExportQueryDto } from '../dto/report-export-query.dto.js';
import type { IncidentsReportService } from '../incidents-report.service.js';
import type { ParticipationReportService } from '../participation-report.service.js';
import { EXPORT_MAX_ROWS, EXPORT_MESSAGES } from './export.constants.js';
import { ReportExportController } from './report-export.controller.js';
import { ReportExportService } from './report-export.service.js';
import type { ReportTable } from './report-table.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const ADMIN = { id: 'admin-1', email: 'admin@condominio.test' } as User;
const FILTERS = { from: '2026-01-01', to: '2026-11-22' };
/** Más unidades que una página de pantalla (20): el archivo las trae todas. */
const UNITS = Array.from({ length: 25 }, (_, i) => ({
  id: `u-${i}`,
  code: `A-${String(101 + i)}`,
}));

const money = (value: number) => ({ toNumber: () => value });

/**
 * Exportación con el servicio de morosidad real (H32) sobre un Prisma
 * simulado: la misma fuente de cifras que usa la pantalla.
 */
function setup() {
  const prisma = {
    fee: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: money(1125) } }),
      groupBy: vi.fn((args: { _sum?: object; _min?: object }) =>
        Promise.resolve(
          UNITS.map(({ id }, i) =>
            args._sum
              ? { unitId: id, _sum: { amount: money(45) } }
              : args._min
                ? {
                    unitId: id,
                    _min: {
                      dueDate: toDbDate(
                        `2026-10-${String(10 - (i % 9)).padStart(2, '0')}`,
                      ),
                    },
                  }
                : { unitId: id },
          ),
        ),
      ),
    },
    unit: {
      count: vi.fn().mockResolvedValue(25),
      findMany: vi.fn().mockResolvedValue(UNITS),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ fullName: 'Laura Martínez' }),
    },
  };
  const delinquency = new DelinquencyService(
    new DelinquencyRepository(prisma as unknown as PrismaService),
  );
  const exporter = new ReportExportService(
    delinquency,
    {} as AreasUsageService,
    {} as IncidentsReportService,
    {} as ParticipationReportService,
    prisma as unknown as PrismaService,
  );
  return { prisma, delinquency, exporter };
}

async function bytes(file: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Tabla mínima de N filas para probar el límite de exportación. */
const tableOf = (rows: number): ReportTable => ({
  report: 'morosidad',
  title: 'Reporte de morosidad',
  period: FILTERS,
  filters: [],
  summary: [],
  tableTitle: 'Unidades morosas',
  columns: ['Unidad'],
  rows: Array.from({ length: rows }, (_, i) => [`U-${i}`]),
});

const HANDLERS = [
  'delinquency',
  'areas',
  'incidents',
  'participation',
] as const;

function requestAs(
  role: Role,
  handler: (typeof HANDLERS)[number],
): ExecutionContext {
  return {
    getHandler: () => ReportExportController.prototype[handler],
    getClass: () => ReportExportController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H36. Exportación de reportes en PDF y CSV', () => {
  afterEach(() => vi.restoreAllMocks());

  it('AC3: el archivo se descarga como <reporte>_<desde>_<hasta>.<ext>', async () => {
    const { exporter } = setup();
    const table = await exporter.delinquencyTable(
      { format: 'csv', ...FILTERS },
      NOW,
    );

    for (const format of ['pdf', 'csv'] as const) {
      const file = await exporter.toFile(table, format, ADMIN, NOW);
      expect(file.getHeaders().disposition).toBe(
        `attachment; filename="morosidad_2026-01-01_2026-11-22.${format}"`,
      );
    }
  });

  it('AC4: el PDF lleva el encabezado, el título, los filtros, la generación con el administrador, el resumen y la tabla completa', async () => {
    const { exporter } = setup();
    const written: string[] = [];
    const text = PDFDocument.prototype.text;
    vi.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
      this: PDFKit.PDFDocument,
      ...args: Parameters<typeof text>
    ) {
      written.push(String(args[0]));
      return text.apply(this, args);
    });
    const table = await exporter.delinquencyTable(
      { format: 'pdf', ...FILTERS },
      NOW,
    );

    const file = await exporter.toFile(table, 'pdf', ADMIN, NOW);

    expect(file.getHeaders().type).toBe('application/pdf');
    expect((await bytes(file)).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(written).toEqual(
      expect.arrayContaining([
        'Gestión de Condominios',
        'Reporte de morosidad',
        'Vencimiento desde: ',
        '01/01/2026',
        'Generado el 22/11/2026 12:00 por Laura Martínez',
        'Monto adeudado: ',
        '$1125.00',
      ]),
    );
    // Las 25 unidades, aunque la pantalla pagina de 20 en 20.
    for (const { code } of UNITS) expect(written).toContain(code);
  });

  it('AC5: el CSV usa UTF-8 con BOM, coma como separador, una fila de encabezados y la tabla completa', async () => {
    const { exporter } = setup();
    const table = await exporter.delinquencyTable(
      { format: 'csv', ...FILTERS },
      NOW,
    );

    const file = await exporter.toFile(table, 'csv', ADMIN, NOW);
    const content = await bytes(file);
    const lines = content.toString('utf8').slice(1).trim().split('\r\n');

    expect(file.getHeaders().type).toBe('text/csv; charset=utf-8');
    expect([...content.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(lines[0]).toBe('Unidad,Monto adeudado ($),Antigüedad (días)');
    expect(lines).toHaveLength(1 + UNITS.length);
    expect(lines[1].split(',')).toHaveLength(3);
  });

  it('AC6: el archivo usa el mismo servicio y los mismos filtros que la pantalla, sin paginar', async () => {
    const { delinquency, exporter } = setup();
    const getReport = vi.spyOn(delinquency, 'getReport');

    const table = await exporter.delinquencyTable(
      { format: 'csv', ...FILTERS },
      NOW,
    );

    expect(getReport).toHaveBeenCalledWith(
      { ...FILTERS, page: 1, pageSize: EXPORT_MAX_ROWS + 1 },
      NOW,
    );
    // La pantalla, con las mismas fechas, da las mismas cifras.
    const screen = await delinquency.getReport(
      { ...FILTERS, page: 1, pageSize: 50 },
      NOW,
    );
    expect(table.rows).toEqual(
      screen.data.map((row) => [
        row.unitCode,
        row.owedAmount.toFixed(2),
        row.ageDays,
      ]),
    );
    expect(table.summary).toContainEqual([
      'Monto adeudado',
      `$${screen.summary.owedAmount.toFixed(2)}`,
    ]);
  });

  it('AC7: más de 5,000 filas responde 400 con el mensaje de la tarjeta; 5,000 sí se exportan', async () => {
    const { exporter } = setup();

    const error = await exporter
      .toFile(tableOf(EXPORT_MAX_ROWS + 1), 'csv', ADMIN, NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: ['El reporte supera 5,000 filas. Reduce el rango.'],
    });
    await expect(
      exporter.toFile(tableOf(EXPORT_MAX_ROWS), 'csv', ADMIN, NOW),
    ).resolves.toBeDefined();
  });

  it('AC7: un formato distinto de pdf o csv responde 400 en format', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    });

    const error = await pipe
      .transform(
        { format: 'xlsx' },
        { type: 'query', metatype: DelinquencyExportQueryDto },
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'format',
      message: [EXPORT_MESSAGES.format],
    });
  });

  it('AC7: solo existen las rutas de los cuatro reportes; cualquier otro responde 404', () => {
    const paths = HANDLERS.map(
      (handler) =>
        Reflect.getMetadata(
          PATH_METADATA,
          ReportExportController.prototype[handler],
        ) as string,
    );

    expect(paths).toEqual([
      'morosidad/exportar',
      'areas/exportar',
      'incidencias/exportar',
      'participacion/exportar',
    ]);
    expect(Reflect.getMetadata(PATH_METADATA, ReportExportController)).toBe(
      'admin/reportes',
    );
  });

  it.each(['RESIDENTE', 'SEGURIDAD'] as const)(
    'AC7: %s recibe 403 al exportar cualquier reporte',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      for (const handler of HANDLERS) {
        expect(() => guard.canActivate(requestAs(role, handler))).toThrow(
          'No tienes permiso para esta acción.',
        );
      }
    },
  );

  it('AC7: el Administrador sí exporta', () => {
    const guard = new RolesGuard(new Reflector());
    for (const handler of HANDLERS) {
      expect(guard.canActivate(requestAs('ADMINISTRADOR', handler))).toBe(true);
    }
  });
});
