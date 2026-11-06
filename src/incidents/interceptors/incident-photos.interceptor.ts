import {
  BadRequestException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { badRequest } from '@Common/validation';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  PHOTO_MESSAGES,
} from '../incidents.constants.js';

export const PHOTOS_FIELD = 'photos';

/**
 * Lee el multipart de H10 con multer (en memoria, máximo 3 archivos de 5 MB).
 *
 * Se usa en lugar de FilesInterceptor de Nest para responder los límites con
 * 400 y `field: "photos"`, como pide H10 (FilesInterceptor responde 413 en
 * inglés cuando un archivo supera el tamaño). Corre después de los guards, así
 * que sin sesión o con otro rol el cuerpo ni siquiera se lee.
 */
@Injectable()
export class IncidentPhotosInterceptor implements NestInterceptor {
  private readonly upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
  }).array(PHOTOS_FIELD, MAX_PHOTOS);

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    await new Promise<void>((resolve, reject) => {
      this.upload(
        http.getRequest<Request>(),
        http.getResponse<Response>(),
        (error: unknown) =>
          error ? reject(this.toHttpError(error)) : resolve(),
      );
    });
    return next.handle();
  }

  private toHttpError(error: unknown): Error {
    if (!(error instanceof multer.MulterError)) {
      return new BadRequestException('No se pudo leer el formulario.');
    }
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return badRequest(PHOTOS_FIELD, PHOTO_MESSAGES.invalid);
      case 'LIMIT_FILE_COUNT':
        return badRequest(PHOTOS_FIELD, PHOTO_MESSAGES.tooMany);
      case 'LIMIT_UNEXPECTED_FILE':
        // Un cuarto archivo en "photos", o un archivo en otro campo.
        return error.field === PHOTOS_FIELD
          ? badRequest(PHOTOS_FIELD, PHOTO_MESSAGES.tooMany)
          : badRequest(
              error.field ?? PHOTOS_FIELD,
              'Este campo no admite archivos.',
            );
      default:
        return badRequest(PHOTOS_FIELD, 'No se pudo leer el formulario.');
    }
  }
}
