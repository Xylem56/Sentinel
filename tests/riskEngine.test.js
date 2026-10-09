
jest.mock('../config/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
}));

const { evaluateTransaction } = require('../services/riskEngine');

function createMockPool(overrides = {}) {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('device_history')) return { rows: overrides.device || [] };
      if (sql.includes('location_history')) return { rows: overrides.location || [] };
      if (sql.includes('amount_baseline')) return { rows: overrides.baseline || [] };
      if (sql.includes('COUNT(*) AS count')) return { rows: [{ count: overrides.recentCount ?? 0 }] };
      if (sql.includes('SUM(amount)')) return { rows: [{ total: overrides.balanceMoved ?? 0 }] };
      if (sql.includes('flagged_recipients')) return { rows: overrides.flagged || [] };
      return { rows: [] };
    }),
  };
}

const baseTx = {
  userId: 'user1',
  deviceId: 'device1',
  latitude: 6.5,
  longitude: 3.3,
  amount: 100,
  currentBalance: 5000,
  recipientAccount: 'acct1',
};

const knownDevice = [{ device_id: 'device1', last_seen_at: new Date()}] 
const otherDevice = [{ device_id: 'some-other-phone', last_seen_at: new Date() }];
const knownLocation = [{ latitude: 6.5, longitude: 3.3, last_seen_at: new Date() }];
const farLocation = [{ latitude: 51.5, longitude: -0.12, last_seen_at: new Date() }]; // London

test('approves a clean transaction with no risk signals', async () => {
  const pool = createMockPool({ device: knownDevice, location: knownLocation });
  const result = await evaluateTransaction(pool, baseTx);

  expect(result.decision).toBe('approve');
  expect(result.score).toBe(0);
});

test('first-ever transaction for a new user is approved (trust on first use)', async () => {
  const pool = createMockPool({ device: [], location: [] });
  const result = await evaluateTransaction(pool, baseTx);

  expect(result.decision).toBe('approve');
  expect(result.score).toBe(0);
});

test('a different device for an existing user forces a challenge', async () => {
  const pool = createMockPool({ device: otherDevice, location: knownLocation });
  const result = await evaluateTransaction(pool, baseTx);

  expect(result.reasons).toContain('unknown_device');
  expect(result.decision).toBe('challenge');
});

test('unusual location forces a challenge', async () => {
  const pool = createMockPool({ device: knownDevice, location: farLocation });
  const result = await evaluateTransaction(pool, baseTx);

  expect(result.reasons).toContain('unusual_location');
  expect(result.decision).toBe('challenge');
});

test('amount outside the personal baseline forces a challenge', async () => {
  const pool = createMockPool({
    device: knownDevice,
    location: knownLocation,
    baseline: [{ min_amount: 50, max_amount: 300, last_updated_at: new Date() }],
  });
  const result = await evaluateTransaction(pool, { ...baseTx, amount: 5000 });

  expect(result.reasons).toContain('unusual_amount');
  expect(result.decision).toBe('challenge');
});

test('too many recent transactions triggers velocity', async () => {
  const pool = createMockPool({ device: knownDevice, location: knownLocation, recentCount: 6 });
  const result = await evaluateTransaction(pool, baseTx);

  expect(result.reasons).toContain('velocity_exceeded');
  expect(result.decision).toBe('challenge');
});

test('flagged recipient is blocked outright', async () => {
  const pool = createMockPool({
    device: knownDevice,
    location: knownLocation,
    flagged: [{ recipient_account: 'bad-acct' }],
  });
  const result = await evaluateTransaction(pool, { ...baseTx, recipientAccount: 'bad-acct' });

  expect(result.decision).toBe('block');
});

test('stacked signals escalate from challenge to block', async () => {
  const pool = createMockPool({ device: otherDevice, location: farLocation });
  const result = await evaluateTransaction(pool, baseTx);

  expect(result.score).toBe(90);
  expect(result.decision).toBe('block');
});