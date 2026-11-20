import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EXPORT_MESSAGES } from '../export/export.constants.js';
import {
  AreasUsageExportQueryDto,
  DelinquencyExportQueryDto,
  IncidentsReportExportQueryDto,
  ParticipationExportQueryDto,
} from './report-export-query.dto.js';

type DtoClass = new () => object;

async function errorsOf(cls: DtoClass, raw: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, raw), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return Object.fromEntries(
    errors.map((error) => [
      error.property,
      Object.values(error.constraints ?? {}),
    ]),
  );
}

const DTOS: [string, DtoClass][] = [
  ['morosidad', DelinquencyExportQueryDto],
  ['areas', AreasUsageExportQueryDto],
  ['incidencias', IncidentsReportExportQueryDto],
  ['participacion', ParticipationExportQueryDto],
];

describe('H36. Filtros de la exportación', () => {
  describe.each(DTOS)('%s', (_name, cls) => {
    it('acepta pdf y csv con los filtros de fecha del reporte', async () => {
      for (const format of ['pdf', 'csv']) {
        expect(
          await errorsOf(cls, {
            format,
            from: '2026-01-01',
            to: '2026-11-20',
          }),
        ).toEqual({});
      }
    });

    it('400 con un formato distinto de pdf o csv, o sin formato', async () => {
      expect(await errorsOf(cls, { format: 'xlsx' })).toEqual({
        format: [EXPORT_MESSAGES.format],
      });
      expect(await errorsOf(cls, {})).toEqual({
        format: [EXPORT_MESSAGES.format],
      });
    });

    it('valida las fechas igual que el reporte', async () => {
      const errors = await errorsOf(cls, { format: 'csv', from: '20/11/2026' });
      expect(Object.keys(errors)).toEqual(['from']);
    });

    it('no acepta paginación: el archivo lleva la tabla completa', async () => {
      const errors = await errorsOf(cls, { format: 'csv', page: 2 });
      expect(Object.keys(errors)).toEqual(['page']);
    });
  });

  it('participación acepta una asamblea', async () => {
    expect(
      await errorsOf(ParticipationExportQueryDto, {
        format: 'pdf',
        assemblyId: '5b1b7e0e-6c1f-4a8e-9a43-0f1d3a2b7c9d',
      }),
    ).toEqual({});
    expect(
      Object.keys(
        await errorsOf(ParticipationExportQueryDto, {
          format: 'pdf',
          assemblyId: 'no-es-uuid',
        }),
      ),
    ).toEqual(['assemblyId']);
  });
});
