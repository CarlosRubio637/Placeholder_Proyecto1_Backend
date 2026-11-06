import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { posix, resolve, sep } from 'node:path';
import type { ReadStream } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { INCIDENT_UPLOADS_DIR, UPLOADS_ROOT } from '../incidents.constants.js';
import { IMAGE_EXTENSIONS, type AllowedImageType } from '../utils/index.js';

export interface PhotoToSave {
  buffer: Buffer;
  mimeType: AllowedImageType;
}

export interface SavedPhoto {
  /** Relativa a UPLOADS_ROOT, con "/": incidencias/<id>/<archivo>. */
  path: string;
  mimeType: AllowedImageType;
  sizeBytes: number;
}

/**
 * Archivos de las fotografías de incidencias en disco (H10).
 *
 * El nombre lo genera el servidor (uuid + extensión según el tipo real), así
 * que el nombre que manda el cliente nunca llega al sistema de archivos.
 */
@Injectable()
export class IncidentPhotoStorage {
  /**
   * Guarda todas las fotos en incidencias/<incidentId>/. Si alguna falla,
   * borra la carpeta y relanza el error: todo o nada.
   */
  async saveAll(
    incidentId: string,
    photos: PhotoToSave[],
  ): Promise<SavedPhoto[]> {
    const relativeDir = posix.join(INCIDENT_UPLOADS_DIR, incidentId);
    try {
      await mkdir(this.absolute(relativeDir), { recursive: true });
      const saved: SavedPhoto[] = [];
      for (const photo of photos) {
        const path = posix.join(
          relativeDir,
          `${randomUUID()}.${IMAGE_EXTENSIONS[photo.mimeType]}`,
        );
        await writeFile(this.absolute(path), photo.buffer, { flag: 'wx' });
        saved.push({
          path,
          mimeType: photo.mimeType,
          sizeBytes: photo.buffer.length,
        });
      }
      return saved;
    } catch (error) {
      await this.removeIncident(incidentId);
      throw error;
    }
  }

  /** Borra la carpeta de la incidencia (por ejemplo, si falló la transacción). */
  async removeIncident(incidentId: string): Promise<void> {
    await rm(this.absolute(posix.join(INCIDENT_UPLOADS_DIR, incidentId)), {
      recursive: true,
      force: true,
    });
  }

  /** Abre un archivo guardado. Devuelve null si ya no existe en disco. */
  async open(
    path: string,
  ): Promise<{ stream: ReadStream; size: number } | null> {
    const absolute = this.absolute(path);
    try {
      const { size } = await stat(absolute);
      return { stream: createReadStream(absolute), size };
    } catch {
      return null;
    }
  }

  /** Ruta absoluta dentro de UPLOADS_ROOT; rechaza cualquier intento de salir de ella. */
  private absolute(relativePath: string): string {
    const absolute = resolve(UPLOADS_ROOT, ...relativePath.split('/'));
    if (absolute !== UPLOADS_ROOT && !absolute.startsWith(UPLOADS_ROOT + sep)) {
      throw new Error(`Ruta fuera de la carpeta de uploads: ${relativePath}`);
    }
    return absolute;
  }
}
