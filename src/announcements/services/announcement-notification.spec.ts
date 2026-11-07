import { buildAnnouncementNotification } from './announcement-notification.js';

const announcement = {
  id: '5d3c2b1a-0f9e-4d8c-8b7a-6f5e4d3c2b1a',
  title: 'Corte de agua el 4 de noviembre',
  category: 'CORTE_SERVICIO' as const,
  audience: 'TORRES' as const,
  expiresOn: '2026-11-14',
  towerIds: ['t-a'],
};

describe('aviso de un comunicado', () => {
  it('arma el aviso de un comunicado por torres', () => {
    expect(buildAnnouncementNotification(announcement)).toEqual({
      recipient: { type: 'TORRES', ids: ['t-a'] },
      title: 'Nuevo comunicado: Corte de agua el 4 de noviembre',
      message:
        'Corte de servicio. Vigente hasta el 14/11/2026. Ábrelo en Comunicados para confirmar tu lectura.',
      sourceModule: 'COMUNICADOS',
      reference: { type: 'announcement', id: announcement.id },
    });
  });

  it('manda a TODOS sin ids', () => {
    const input = buildAnnouncementNotification({
      ...announcement,
      audience: 'TODOS',
      towerIds: [],
    });
    expect(input.recipient).toEqual({ type: 'TODOS', ids: [] });
  });

  it('recorta a 100 caracteres el título del aviso de un comunicado largo', () => {
    const { title } = buildAnnouncementNotification({
      ...announcement,
      title: 'x'.repeat(100),
    });
    expect(title).toHaveLength(100);
    expect(title.startsWith('Nuevo comunicado: xxx')).toBe(true);
    expect(title.endsWith('...')).toBe(true);
  });
});
