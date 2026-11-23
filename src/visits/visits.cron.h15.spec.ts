import { VisitsCronService } from './visits.cron.js';

// Llave con la que @Cron de @nestjs/schedule guarda sus opciones.
const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';

describe('H15. Mis visitas: cancelar autorizaciones y responder solicitudes', () => {
  it('AC7: la tarea que vence las solicitudes corre cada minuto, en la hora del condominio', () => {
    const options = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      Reflect.get(VisitsCronService.prototype, 'expireRequests') as object,
    ) as { cronTime: string; timeZone: string };

    expect(options.cronTime).toBe('0 * * * * *');
    expect(options.timeZone).toBe('America/El_Salvador');
  });
});
