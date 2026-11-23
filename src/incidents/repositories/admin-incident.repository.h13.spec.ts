import { ALLOWED_TRANSITIONS } from './admin-incident.repository.js';

describe('H13. Cambio de estado y seguimiento de incidencias', () => {
  it('AC4: la tabla de estados tiene solo Pendiente → En proceso, En proceso → Resuelto y Resuelto → En proceso', () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      PENDIENTE: ['EN_PROCESO'],
      EN_PROCESO: ['RESUELTO'],
      RESUELTO: ['EN_PROCESO'],
    });
  });

  it('AC6: no permite pasar de Pendiente a Resuelto', () => {
    expect(ALLOWED_TRANSITIONS.PENDIENTE).not.toContain('RESUELTO');
  });
});
