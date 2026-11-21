import { ApiProperty } from '@nestjs/swagger';
import { FeeStatus, PaymentStatus } from '@PrismaClient';

export class FeeDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty({ example: 'Cuota de mantenimiento octubre 2026' })
  concept!: string;
  @ApiProperty({ example: 45 }) amount!: number;
  @ApiProperty({ example: '2026-10-10' }) dueDate!: string;
  @ApiProperty({ enum: FeeStatus }) status!: FeeStatus;
}

class PaymentFeeRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty({ enum: FeeStatus }) status!: FeeStatus;
}

/** Respuesta de POST /cuotas/:cuotaId/pagos (H1). */
export class PaymentResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'TX-20261119-000001' }) transactionNumber!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ type: String, nullable: true }) failureReason!: string | null;
  @ApiProperty({ example: 45 }) amount!: number;
  @ApiProperty({ example: '4242' }) cardLast4!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: PaymentFeeRefDto }) fee!: PaymentFeeRefDto;
}

class ReceiptFeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '2026-10' }) period!: string;
  @ApiProperty() concept!: string;
  @ApiProperty({ example: '2026-10-10' }) dueDate!: string;
  @ApiProperty({ enum: FeeStatus }) status!: FeeStatus;
}

/** Recibo de GET /pagos/:pagoId (H1). */
export class PaymentReceiptDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() transactionNumber!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ type: String, nullable: true }) failureReason!: string | null;
  @ApiProperty() amount!: number;
  @ApiProperty() cardLast4!: string;
  @ApiProperty() holderName!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ example: { code: 'A-102' } }) unit!: { code: string };
  @ApiProperty({ type: ReceiptFeeDto }) fee!: ReceiptFeeDto;
}

/** Pago dentro del detalle de una cuota (H2). */
export class FeePaymentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() transactionNumber!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty() amount!: number;
  @ApiProperty() cardLast4!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ type: String, nullable: true }) failureReason!: string | null;
}

export class FeePaymentListDto {
  @ApiProperty({ type: [FeePaymentDto] }) data!: FeePaymentDto[];
}

class StatementSummaryDto {
  @ApiProperty({
    example: 90,
    description: 'Suma de cuotas Pendiente y Moroso, sin filtros.',
  })
  pendingBalance!: number;
  @ApiProperty({ example: 1 }) overdueCount!: number;
  @ApiProperty({ type: String, nullable: true, example: '2026-11-10' })
  nextDueDate!: string | null;
}

class StatementFeeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() period!: string;
  @ApiProperty() concept!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() dueDate!: string;
  @ApiProperty({ enum: FeeStatus }) status!: FeeStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt!: Date | null;
}

/** Estado de cuenta de una unidad (H2). */
export class AccountStatementDto {
  @ApiProperty({ example: { id: 'uuid', code: 'A-102' } }) unit!: {
    id: string;
    code: string;
  };
  @ApiProperty({ type: StatementSummaryDto }) summary!: StatementSummaryDto;
  @ApiProperty({
    type: [Number],
    example: [2026],
    description: 'Años con cuotas, para el filtro.',
  })
  years!: number[];
  @ApiProperty({ type: [StatementFeeDto] }) data!: StatementFeeDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

/** Unidad para la administración (H2). */
export class AdminUnitDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'A-102' }) code!: string;
  @ApiProperty({ example: { id: 'uuid', name: 'Torre A' } }) tower!: {
    id: string;
    name: string;
  };
  @ApiProperty({ example: 'PT72YRGA' }) registrationCode!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registrationCodeUpdatedAt!: Date | null;
  @ApiProperty({
    example: [{ fullName: 'Ana López', email: 'ana@correo.com' }],
  })
  residents!: { fullName: string; email: string }[];
}

export class RegistrationCodeDto {
  @ApiProperty({ example: 'K7M2PQ9X' }) registrationCode!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  registrationCodeUpdatedAt!: Date;
}
