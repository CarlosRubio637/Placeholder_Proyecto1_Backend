import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
  type SendNotificationInput,
} from '@Notifications';
import {
  addDays,
  formatDateEs,
  fromDbDate,
  toDbDate,
  todayIso,
} from '@Common/time';
import { periodLabel } from '../billing-period/index.js';
import type { FeeTasksResultDto } from '../dto/index.js';
import {
  FEE_TASK_TITLES,
  OVERDUE_AFTER_DAYS,
  REMINDER_DAYS_BEFORE,
  overdueMessage,
  reminderMessage,
} from '../fees.constants.js';
import {
  FeeTasksRepository,
  type FeeTaskCandidate,
} from '../repositories/index.js';

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function feeLabel(fee: FeeTaskCandidate): string {
  return `${periodLabel(fee.period)} de $${money.format(fee.amount.toNumber())}`;
}

function feeNotification(
  fee: FeeTaskCandidate,
  title: string,
  message: string,
): SendNotificationInput {
  return {
    recipient: { type: RecipientType.UNIDAD, ids: [fee.unitId] },
    title,
    message,
    sourceModule: SourceModule.CUOTAS,
    reference: { type: 'fee', id: fee.id },
  };
}

@Injectable()
export class FeeTasksService {
  private readonly logger = new Logger(FeeTasksService.name);

  constructor(
    private readonly repository: FeeTasksRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async markOverdueFees(now = new Date()): Promise<number> {
    const today = todayIso(now);
    const lastDueDate = toDbDate(addDays(today, -(OVERDUE_AFTER_DAYS + 1)));
    const candidates = await this.repository.findOverdueCandidates(lastDueDate);
    let marked = 0;
    for (const fee of candidates) {
      if (!(await this.repository.markOverdue(fee.id, now))) continue;
      marked += 1;
      await this.notify(
        feeNotification(
          fee,
          FEE_TASK_TITLES.overdue,
          overdueMessage(feeLabel(fee), formatDateEs(today)),
        ),
      );
    }
    return marked;
  }

  async sendReminders(now = new Date()): Promise<number> {
    const today = todayIso(now);
    const candidates = await this.repository.findReminderCandidates(
      toDbDate(today),
      toDbDate(addDays(today, REMINDER_DAYS_BEFORE)),
    );
    let sent = 0;
    for (const fee of candidates) {
      if (!(await this.repository.markReminded(fee.id, now))) continue;
      sent += 1;
      await this.notify(
        feeNotification(
          fee,
          FEE_TASK_TITLES.reminder,
          reminderMessage(feeLabel(fee), formatDateEs(fromDbDate(fee.dueDate))),
        ),
      );
    }
    return sent;
  }

  async runAll(now = new Date()): Promise<FeeTasksResultDto> {
    const markedOverdue = await this.markOverdueFees(now);
    const remindersSent = await this.sendReminders(now);
    return { markedOverdue, remindersSent };
  }

  private async notify(input: SendNotificationInput): Promise<void> {
    try {
      await this.notifications.send(input);
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el aviso "${input.title}" de la cuota ${input.reference?.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
