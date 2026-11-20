import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CONDOMINIUM_TIME_ZONE } from '@Common/time';
import { OVERDUE_CRON, REMINDER_CRON } from './fees.constants.js';
import { FeeTasksService } from './services/index.js';

const OVERDUE_JOB = 'fees-overdue';
const REMINDER_JOB = 'fees-reminders';

@Injectable()
export class FeeTasksCron {
  private readonly logger = new Logger(FeeTasksCron.name);
  private readonly running = new Set<string>();

  constructor(private readonly tasks: FeeTasksService) {}

  @Cron(OVERDUE_CRON, { name: OVERDUE_JOB, timeZone: CONDOMINIUM_TIME_ZONE })
  async markOverdue(): Promise<void> {
    await this.exclusive(OVERDUE_JOB, async () => {
      const marked = await this.tasks.markOverdueFees();
      this.logger.log(`Tarea de mora: ${marked} cuotas pasaron a Moroso`);
    });
  }

  @Cron(REMINDER_CRON, { name: REMINDER_JOB, timeZone: CONDOMINIUM_TIME_ZONE })
  async sendReminders(): Promise<void> {
    await this.exclusive(REMINDER_JOB, async () => {
      const sent = await this.tasks.sendReminders();
      this.logger.log(`Tarea de recordatorios: ${sent} recordatorios enviados`);
    });
  }

  private async exclusive(
    job: string,
    task: () => Promise<void>,
  ): Promise<void> {
    if (this.running.has(job)) {
      this.logger.warn(`La tarea ${job} sigue en curso; se omite esta corrida`);
      return;
    }
    this.running.add(job);
    try {
      await task();
    } finally {
      this.running.delete(job);
    }
  }
}
