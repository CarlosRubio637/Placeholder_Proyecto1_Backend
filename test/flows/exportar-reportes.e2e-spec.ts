import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { AssembliesCronService } from '../../src/admin/assemblies/assemblies.cron.js';
import { addDays, todayIso } from '../../src/common/time/index.js';
import {
  PNG,
  api,
  createTestApp,
  db,
  login,
  resetData,
} from '../support/app.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BOM = '﻿';
const TOO_MANY_ROWS = 'El reporte supera 5,000 filas. Reduce el rango.';

/** CSV mínimo (RFC 4180): comillas dobles y comas dentro de comillas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else {
      cell += char;
    }
  }
  return rows;
}

/** Lee el cuerpo como bytes, sea cual sea el tipo. */
function binary(
  res: Response,
  callback: (error: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/** Flujo H32 a H35 → H36: los archivos traen las mismas cifras que la pantalla. */
describe('Flujo de exportación de reportes (H32 a H35, H36)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string;
  let seguridad: string;

  const today = todayIso();
  const range = `from=${addDays(today, -60)}&to=${today}`;
  let feeRestore: {
    id: string;
    status: string;
    overdueAt: Date | null;
    dueDate: Date;
  };
  let staleNumber: string;

  const download = (path: string, token = admin) =>
    api(app, token).get(`admin/reportes/${path}`).buffer(true).parse(binary);

  const csv = async (path: string) => {
    const res = await download(path).expect(200);
    const text = (res.body as Buffer).toString('utf8');
    expect(text.startsWith(BOM)).toBe(true);
    const [header, ...rows] = parseCsv(text.slice(BOM.length));
    return { res, header, rows };
  };

  const json = async <T>(path: string) =>
    (await api(app, admin).get(`admin/reportes/${path}`).expect(200)).body as T;

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, seguridad] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'seguridad1'),
    ]);

    // Morosidad: una cuota del seed pasa a Moroso dentro del rango; se
    // restaura al final porque las cuotas son parte del seed.
    const fee = await db(app).fee.findFirstOrThrow({
      orderBy: { dueDate: 'asc' },
      select: { id: true, status: true, overdueAt: true, dueDate: true },
    });
    feeRestore = fee;
    await db(app).fee.update({
      where: { id: fee.id },
      data: {
        status: 'MOROSO',
        overdueAt: new Date(),
        dueDate: new Date(`${addDays(today, -10)}T00:00:00.000Z`),
      },
    });

    // Incidencias: una abierta hace 20 días entra en la lista de más de 7.
    const { body } = await api(app, residente1)
      .post('incidencias')
      .field('title', 'Fuga, "urgente" en el lobby')
      .field('description', 'Descripción de la incidencia de prueba.')
      .field('location', 'LOBBY')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    staleNumber = body.number as string;
    await db(app).incident.update({
      where: { id: body.id as string },
      data: { createdAt: new Date(Date.now() - 20 * DAY) },
    });

    // Participación: una asamblea abierta con dos temas.
    const created = await api(app, admin)
      .post('admin/asambleas')
      .send({
        title: 'Asamblea para exportar',
        startsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
        endsAt: new Date(Date.now() + 50 * HOUR).toISOString(),
        topics: [
          { question: '¿Aprobar el presupuesto?', options: ['Sí', 'No'] },
          { question: '¿Pintar la fachada?', options: ['Sí', 'No'] },
        ],
      })
      .expect(201);
    await db(app).assembly.update({
      where: { id: created.body.id as string },
      data: { startsAt: new Date(Date.now() - 1000) },
    });
    await app.get(AssembliesCronService).handleAssembliesLifecycle();
  });

  afterAll(async () => {
    await db(app).fee.update({
      where: { id: feeRestore.id },
      data: {
        status: feeRestore.status as 'PENDIENTE',
        overdueAt: feeRestore.overdueAt,
        dueDate: feeRestore.dueDate,
      },
    });
    await app.close();
  });

  describe('AC: el CSV trae la tabla completa con las mismas cifras', () => {
    it('morosidad', async () => {
      type Report = {
        data: { unitCode: string; owedAmount: number; ageDays: number }[];
        total: number;
      };
      const screen = await json<Report>(`morosidad?${range}&pageSize=50`);
      const { res, header, rows } = await csv(
        `morosidad/exportar?${range}&format=csv`,
      );

      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="morosidad_${addDays(today, -60)}_${today}.csv"`,
      );
      expect(header).toEqual([
        'Unidad',
        'Monto adeudado ($)',
        'Antigüedad (días)',
      ]);
      expect(screen.total).toBeGreaterThan(0);
      expect(rows).toEqual(
        screen.data.map((row) => [
          row.unitCode,
          row.owedAmount.toFixed(2),
          String(row.ageDays),
        ]),
      );
    });

    it('áreas', async () => {
      type Report = {
        data: {
          name: string;
          confirmed: number;
          cancelled: number;
          reservedHours: number;
          enabledHours: number;
          occupancyPct: number;
        }[];
      };
      const screen = await json<Report>(`areas?${range}`);
      const { rows } = await csv(`areas/exportar?${range}&format=csv`);

      expect(screen.data.length).toBeGreaterThan(0);
      expect(rows).toEqual(
        screen.data.map((area) =>
          [
            area.name,
            area.confirmed,
            area.cancelled,
            area.reservedHours,
            area.enabledHours,
            area.occupancyPct,
          ].map(String),
        ),
      );
    });

    it('incidencias: las abiertas con más de 7 días, sin paginar', async () => {
      type Report = { stale: { data: { number: string }[]; total: number } };
      const screen = await json<Report>(`incidencias?${range}`);
      const { rows } = await csv(`incidencias/exportar?${range}&format=csv`);

      expect(rows).toHaveLength(screen.stale.total);
      expect(rows.map((row) => row[0])).toEqual(
        screen.stale.data.map((row) => row.number),
      );
      // El título con coma y comillas sobrevive al CSV.
      expect(rows.find((row) => row[0] === staleNumber)?.[1]).toBe(
        'Fuga, "urgente" en el lobby',
      );
    });

    it('participación: una fila por tema', async () => {
      type Report = {
        data: {
          title: string;
          topics: { question: string; participationPct: number }[];
        }[];
      };
      const screen = await json<Report>(`participacion?${range}`);
      const { rows } = await csv(`participacion/exportar?${range}&format=csv`);

      const expected = screen.data.flatMap((assembly) =>
        assembly.topics.map((topic) => [
          assembly.title,
          topic.question,
          String(topic.participationPct),
        ]),
      );
      expect(expected).toHaveLength(2);
      expect(rows.map((row) => [row[0], row[4], row[7]])).toEqual(expected);
    });

    it('sin fechas usa el periodo por defecto del reporte en el nombre', async () => {
      const res = await download('incidencias/exportar?format=csv').expect(200);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="incidencias_${today.slice(0, 8)}01_${today}.csv"`,
      );
    });
  });

  describe('AC: el PDF', () => {
    it.each(['morosidad', 'areas', 'incidencias', 'participacion'])(
      '%s se descarga como PDF con su nombre de archivo',
      async (report) => {
        const res = await download(
          `${report}/exportar?${range}&format=pdf`,
        ).expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe(
          `attachment; filename="${report}_${addDays(today, -60)}_${today}.pdf"`,
        );
        expect((res.body as Buffer).subarray(0, 5).toString('latin1')).toBe(
          '%PDF-',
        );
      },
    );
  });

  describe('AC: errores', () => {
    it('400 con un formato distinto de pdf o csv, o sin formato', async () => {
      const xlsx = await api(app, admin)
        .get('admin/reportes/morosidad/exportar?format=xlsx')
        .expect(400);
      expect(xlsx.body).toMatchObject({
        field: 'format',
        message: ['El formato debe ser pdf o csv.'],
      });
      await api(app, admin)
        .get('admin/reportes/morosidad/exportar')
        .expect(400);
    });

    it('400 con los mismos filtros inválidos que el reporte', async () => {
      const { body } = await api(app, admin)
        .get(
          `admin/reportes/areas/exportar?format=csv&from=${today}&to=${addDays(today, -1)}`,
        )
        .expect(400);
      expect(body.field).toBe('to');
    });

    it('400 si se intenta paginar', async () => {
      await api(app, admin)
        .get('admin/reportes/incidencias/exportar?format=csv&page=2')
        .expect(400);
    });

    it('404 con un reporte que no existe', async () => {
      await api(app, admin)
        .get('admin/reportes/visitas/exportar?format=csv')
        .expect(404);
    });

    it('403 para Residente y Seguridad', async () => {
      for (const token of [residente1, seguridad]) {
        await api(app, token)
          .get('admin/reportes/morosidad/exportar?format=csv')
          .expect(403);
      }
    });

    it('400 con más de 5,000 filas', async () => {
      const unit = await db(app).unit.findFirstOrThrow({
        select: { id: true },
      });
      const reporter = await db(app).user.findFirstOrThrow({
        where: { role: 'RESIDENTE' },
        select: { id: true },
      });
      const createdAt = new Date(Date.now() - 30 * DAY);
      await db(app).incident.createMany({
        data: Array.from({ length: 5000 }, (_, index) => ({
          number: `EXP-${String(index).padStart(5, '0')}`,
          unitId: unit.id,
          reporterId: reporter.id,
          title: 'Incidencia masiva',
          description: 'Para probar el límite de filas.',
          location: 'LOBBY' as const,
          searchKey: 'incidencia masiva',
          createdAt,
        })),
      });

      // 5,000 de la prueba + la del inicio = 5,001.
      const { body } = await api(app, admin)
        .get('admin/reportes/incidencias/exportar?format=csv')
        .expect(400);
      expect(body.message).toEqual([TOO_MANY_ROWS]);

      await db(app).incident.deleteMany({
        where: { number: { startsWith: 'EXP-' } },
      });
    });
  });
});
