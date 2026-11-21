import { BadRequestException } from '@nestjs/common';

/**
 * 400 con la misma forma que produce el ValidationPipe global
 * (validationExceptionFactory), para errores que se validan a mano, por
 * ejemplo los archivos subidos.
 */
export function badRequest(
  field: string,
  message: string,
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: [message],
    field,
  });
}
