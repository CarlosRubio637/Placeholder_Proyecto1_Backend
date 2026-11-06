import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/** Recorre los errores (incluidos los anidados) en el mismo orden que Nest. */
function flatten(
  errors: ValidationError[],
  parent = '',
): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/**
 * exceptionFactory del ValidationPipe global.
 *
 * Mantiene la respuesta por defecto de Nest (`message` con la lista de
 * mensajes) y le agrega `field`: el primer campo que falló, para que el
 * frontend pueda mostrar el error junto al campo (H10).
 *
 *   { statusCode: 400, error: 'Bad Request', message: [...], field: 'title' }
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const items = flatten(errors);
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    // Sin repetidos: un campo ausente suele fallar varias reglas con el mismo mensaje.
    message: [...new Set(items.map((item) => item.message))],
    field: items[0]?.field,
  });
}
