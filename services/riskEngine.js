const { isDeviceKnown } = require('../db/deviceHistory');
const { isLocationKnown } = require('../db/locationHistory');
const { getAmountBaseline } = require('../db/amountBaseline');
const { getRecentTransactionCount, getBalanceMovedInWindow } = require('../db/transactions');
const { isRecipientFlagged } = require('../db/flaggedRecipients');

const POINTS = {
  UNKNOWN_DEVICE: 45,
  UNUSUAL_LOCATION: 45,
  UNUSUAL_AMOUNT: 45,
  VELOCITY: 45,
  FLAGGED_RECIPIENT: 90,
};

async function evaluateTransaction(pool, tx) {
  let score = 0;
  const reasons = [];

  
  const deviceKnown = await isDeviceKnown(pool, tx.userId, tx.deviceId);
  if (deviceKnown === false) {
    score += POINTS.UNKNOWN_DEVICE;
    reasons.push('unknown_device');
  }


  const locationKnown = await isLocationKnown(pool, tx.userId, tx.latitude, tx.longitude);
  if (locationKnown === false) {
    score += POINTS.UNUSUAL_LOCATION;
    reasons.push('unusual_location');
  }

  const baseline = await getAmountBaseline(pool, tx.userId);
  if (baseline && !baseline.isStale) {
    if (tx.amount < baseline.minAmount || tx.amount > baseline.maxAmount) {
      score += POINTS.UNUSUAL_AMOUNT;
      reasons.push('unusual_amount');
    }
  }

  const recentCount = await getRecentTransactionCount(pool, tx.userId, 15);
  const balanceMoved = await getBalanceMovedInWindow(pool, tx.userId, 6);
  if (recentCount >= 5 || balanceMoved > tx.currentBalance * 0.2) {
    score += POINTS.VELOCITY;
    reasons.push('velocity_exceeded');
  }

  const flagged = await isRecipientFlagged(pool, tx.recipientAccount);
  if (flagged) {
    score += POINTS.FLAGGED_RECIPIENT;
    reasons.push('recipient_flagged');
  }

  let decision;
  if (score <= 40) decision = 'approve';
  else if (score <= 80) decision = 'challenge';
  else decision = 'block';

  return { decision, score, reasons };
}

module.exports = { evaluateTransaction };