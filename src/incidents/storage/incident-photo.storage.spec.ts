import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { IncidentPhotoStorage } from './incident-photo.storage.js';

// UPLOADS_ROOT se calcula al importar las constantes: se apunta a una carpeta
// temporal antes de que se carguen.
const UPLOADS = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? '/tmp'}/h10-storage-${process.pid}-${Date.now()}`;
  process.env.UPLOADS_DIR = dir;
  return dir;
});

const INCIDENT = '7d1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 2]);

const incidentDir = () => join(UPLOADS, 'incidencias', INCIDENT);

describe('H10. Registro de incidencia con evidencia', () => {
  beforeEach(() => mkdirSync(UPLOADS, { recursive: true }));
  afterEach(() => rmSync(UPLOADS, { recursive: true, force: true }));

  it('AC6: guarda las fotos en uploads/incidencias/<id>/ con un nombre generado por el servidor', async () => {
    const saved = await new IncidentPhotoStorage().saveAll(INCIDENT, [
      { buffer: PNG, mimeType: 'image/png' },
      { buffer: JPG, mimeType: 'image/jpeg' },
    ]);

    expect(saved).toHaveLength(2);
    expect(saved[0].path).toMatch(
      new RegExp(`^incidencias/${INCIDENT}/[0-9a-f-]{36}\\.png$`),
    );
    expect(saved[1].path).toMatch(
      new RegExp(`^incidencias/${INCIDENT}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(saved.map((p) => [p.mimeType, p.sizeBytes])).toEqual([
      ['image/png', PNG.length],
      ['image/jpeg', JPG.length],
    ]);
    expect(readdirSync(incidentDir()).sort()).toEqual(
      saved.map((p) => p.path.split('/')[2]).sort(),
    );
    expect(readFileSync(join(UPLOADS, saved[0].path))).toEqual(PNG);
  });

  it('AC6: si falla el guardado de un archivo, borra lo ya escrito (todo o nada)', async () => {
    // Un contenido que writeFile no acepta hace fallar la segunda escritura.
    const broken = { buffer: 42, mimeType: 'image/png' };

    await expect(
      new IncidentPhotoStorage().saveAll(INCIDENT, [
        { buffer: PNG, mimeType: 'image/png' },
        broken as never,
      ]),
    ).rejects.toThrow();

    expect(() => readdirSync(incidentDir())).toThrow();
  });

  it('AC6: removeIncident borra la carpeta de la incidencia', async () => {
    const storage = new IncidentPhotoStorage();
    await storage.saveAll(INCIDENT, [{ buffer: PNG, mimeType: 'image/png' }]);

    await storage.removeIncident(INCIDENT);

    expect(() => readdirSync(incidentDir())).toThrow();
  });
});
