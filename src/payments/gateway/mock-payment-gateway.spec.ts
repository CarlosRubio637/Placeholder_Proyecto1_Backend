import {
  MockPaymentGateway,
  TEST_CARDS,
  type CardData,
} from './mock-payment-gateway.js';

const card = (number: string): CardData => ({
  number,
  expMonth: 12,
  expYear: 2030,
  cvv: '123',
  holderName: 'Ana Lopez',
});

describe('MockPaymentGateway', () => {
  const previous = process.env.PAYMENT_GATEWAY_DELAY_MS;
  beforeAll(() => {
    process.env.PAYMENT_GATEWAY_DELAY_MS = '0';
  });
  afterAll(() => {
    process.env.PAYMENT_GATEWAY_DELAY_MS = previous;
  });

  it('aprueba la tarjeta terminada en 4242', async () => {
    await expect(
      new MockPaymentGateway().charge(card(TEST_CARDS.approved), 45),
    ).resolves.toEqual({
      approved: true,
    });
  });

  it('rechaza la terminada en 0002 por fondos insuficientes', async () => {
    await expect(
      new MockPaymentGateway().charge(card(TEST_CARDS.insufficientFunds), 45),
    ).resolves.toEqual({ approved: false, reason: 'Fondos insuficientes' });
  });

  it('rechaza cualquier otra tarjeta', async () => {
    await expect(
      new MockPaymentGateway().charge(card('5555555555554444'), 45),
    ).resolves.toEqual({
      approved: false,
      reason: 'Tarjeta no reconocida por la pasarela de prueba',
    });
  });

  it('espera el tiempo configurado antes de responder', async () => {
    process.env.PAYMENT_GATEWAY_DELAY_MS = '50';
    const gateway = new MockPaymentGateway();
    process.env.PAYMENT_GATEWAY_DELAY_MS = '0';
    const started = Date.now();
    await gateway.charge(card(TEST_CARDS.approved), 45);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });
});
