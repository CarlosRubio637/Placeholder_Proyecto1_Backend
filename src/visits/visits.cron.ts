import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CONDOMINIUM_TIME_ZONE } from '@Common/time';
import { PrismaService } from '@Prisma/services';
import { VisitStatus } from '@PrismaClient';
import {
  NO_RESPONSE_REASON,
  REQUEST_RESPONSE_MINUTES,
} from './visits.constants.js';

/**
 * Vencimiento de las autorizaciones (H14): cada 15 minutos, las visitas que
 * siguen Autorizada y cuya vigencia ya terminó (22:00 del día de la visita)
 * pasan a Vencida. Una sola sentencia condicionada por estado: es idempotente.
 */
@Injectable()
export class VisitsCronService {
  private readonly logger = new Logger(VisitsCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */15 * * * *', { timeZone: CONDOMINIUM_TIME_ZONE })
  async expireAuthorizations(now = new Date()): Promise<number> {
    try {
      const result = await this.prisma.visit.updateMany({
        where: { status: VisitStatus.AUTORIZADA, validUntil: { lte: now } },
        data: { status: VisitStatus.VENCIDA },
      });
      if (result.count > 0) {
        this.logger.log(`Autorizaciones de visita vencidas: ${result.count}`);
      }
      return result.count;
    } catch (error) {
      this.logger.error(
        'No se pudieron vencer las autorizaciones',
        error as Error,
      );
      return 0;
    }
  }

  /**
   * Solicitudes sin respuesta (H15): cada minuto, las que siguen Pendiente de
   * autorización después de 15 minutos pasan a Rechazada con el motivo
   * "Sin respuesta del residente". Idempotente: condicionada por estado.
   */
  @Cron('0 * * * * *', { timeZone: CONDOMINIUM_TIME_ZONE })
  async expireRequests(now = new Date()): Promise<number> {
    try {
      const result = await this.prisma.visit.updateMany({
        where: {
          status: VisitStatus.PENDIENTE_AUTORIZACION,
          createdAt: {
            lte: new Date(now.getTime() - REQUEST_RESPONSE_MINUTES * 60 * 1000),
          },
        },
        data: {
          status: VisitStatus.RECHAZADA,
          rejectReason: NO_RESPONSE_REASON,
        },
      });
      if (result.count > 0) {
        this.logger.log(`Solicitudes de visita sin respuesta: ${result.count}`);
      }
      return result.count;
    } catch (error) {
      this.logger.error(
        'No se pudieron vencer las solicitudes',
        error as Error,
      );
      return 0;
    }
  }
}
