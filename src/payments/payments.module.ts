import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  AdminUnitsController,
  PaymentsController,
} from './controllers/index.js';
import { MockPaymentGateway } from './gateway/index.js';
import { PaymentsRepository } from './repositories/index.js';
import { AccountStatementService, PaymentsService } from './services/index.js';

/** Módulo 1 (complemento): pago de cuotas (H1) y estado de cuenta (H2). */
@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, AdminUnitsController],
  providers: [
    PaymentsService,
    AccountStatementService,
    PaymentsRepository,
    MockPaymentGateway,
  ],
})
export class PaymentsModule {}
