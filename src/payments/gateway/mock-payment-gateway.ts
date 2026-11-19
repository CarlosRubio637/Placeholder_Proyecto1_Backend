import { Injectable } from '@nestjs/common';
import { GATEWAY_REASONS } from '../payments.constants.js';

/** Datos de la tarjeta que recibe la pasarela. Nunca se guardan ni se registran. */
export interface CardData {
  number: string;
  expMonth: number;
  expYear: number;
  cvv: string;
  holderName: string;
}

export type ChargeResult =
  { approved: true } | { approved: false; reason: string };

/** Tarjetas de prueba de la card de H1. */
export const TEST_CARDS = {
  approved: '4242424242424242',
  insufficientFunds: '4000000000000002',
} as const;

const DEFAULT_DELAY_MS = 2000;

/**
 * Pasarela de pago simulada (H1). Responde después de 2 segundos: la tarjeta
 * 4242 4242 4242 4242 aprueba, la 4000 0000 0000 0002 rechaza por fondos
 * insuficientes y cualquier otra no se reconoce. Está aislada en su propia
 * clase para poder sustituirla por una pasarela real sin tocar las cuotas.
 *
 * PAYMENT_GATEWAY_DELAY_MS cambia la espera; las pruebas la ponen en 0.
 */
@Injectable()
export class MockPaymentGateway {
  private readonly delayMs = readDelay();

  async charge(card: CardData, _amount: number): Promise<ChargeResult> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (card.number === TEST_CARDS.approved) {
      return { approved: true };
    }
    if (card.number === TEST_CARDS.insufficientFunds) {
      return { approved: false, reason: GATEWAY_REASONS.insufficientFunds };
    }
    return { approved: false, reason: GATEWAY_REASONS.unknownCard };
  }
}

function readDelay(): number {
  const raw = process.env.PAYMENT_GATEWAY_DELAY_MS;
  const value =
    raw === undefined || raw === '' ? DEFAULT_DELAY_MS : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DELAY_MS;
}
