const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function validateTransaction(req, res, next) {
  const { userId, amount, deviceId, latitude, longitude, recipientAccount, currentBalance, idempotencyKey } = req.body;

  if (!UUID_RE.test(userId || '')) return res.status(400).json({ message: 'userId must be a valid UUID' });
  if (!isNum(amount) || amount <= 0) return res.status(400).json({ message: 'amount must be a positive number' });
  if (!isNum(currentBalance) || currentBalance < 0) return res.status(400).json({ message: 'currentBalance must be a non-negative number' });
  if (!isNum(latitude) || latitude < -90 || latitude > 90) return res.status(400).json({ message: 'latitude must be between -90 and 90' });
  if (!isNum(longitude) || longitude < -180 || longitude > 180) return res.status(400).json({ message: 'longitude must be between -180 and 180' });
  if (!isText(deviceId) || !isText(recipientAccount) || !isText(idempotencyKey)) {
    return res.status(400).json({ message: 'deviceId, recipientAccount and idempotencyKey are required' });
  }

  next();
}

module.exports = validateTransaction;