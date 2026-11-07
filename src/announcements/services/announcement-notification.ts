import {
  RecipientType,
  SourceModule,
  type SendNotificationInput,
} from '@Notifications';
import { AudienceType, type AnnouncementCategory } from '@PrismaClient';
import { formatDateEs } from '@Common/time';
import {
  ANNOUNCEMENT_LIMITS,
  CATEGORY_LABELS,
} from '../announcements.constants.js';

export interface AnnouncementNotificationSource {
  id: string;
  title: string;
  category: AnnouncementCategory;
  audience: AudienceType;
  expiresOn: string;
  towerIds: string[];
}

const TRUNCATION_MARK = '...';

function fitTitle(title: string): string {
  const max = ANNOUNCEMENT_LIMITS.notificationTitleMax;
  if (title.length <= max) return title;
  return title.slice(0, max - TRUNCATION_MARK.length) + TRUNCATION_MARK;
}

export function buildAnnouncementNotification(
  announcement: AnnouncementNotificationSource,
): SendNotificationInput {
  const recipient =
    announcement.audience === AudienceType.TODOS
      ? { type: RecipientType.TODOS, ids: [] }
      : { type: RecipientType.TORRES, ids: announcement.towerIds };
  return {
    recipient,
    title: fitTitle(`Nuevo comunicado: ${announcement.title}`),
    message: `${CATEGORY_LABELS[announcement.category]}. Vigente hasta el ${formatDateEs(announcement.expiresOn)}. Ábrelo en Comunicados para confirmar tu lectura.`,
    sourceModule: SourceModule.COMUNICADOS,
    reference: { type: 'announcement', id: announcement.id },
  };
}
