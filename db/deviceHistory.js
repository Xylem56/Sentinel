const redisClient = require('../config/redis');

async function isDeviceKnown(pool, userId, deviceId) {
  const cacheKey = `device-known:${userId}:${deviceId}`;
  const cached = await redisClient.get(cacheKey);

  if (cached !== null) {
    return cached === 'true';
  }

  const result = await pool.query(
    'SELECT device_id, last_seen_at FROM device_history WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null; 
  }

  const tenMonthsAgo = new Date();
  tenMonthsAgo.setMonth(tenMonthsAgo.getMonth() - 10);

  const isKnown = result.rows.some(
    (row) => row.device_id === deviceId && new Date(row.last_seen_at) > tenMonthsAgo
  );

  await redisClient.set(cacheKey, String(isKnown), 'EX', 3600);

  return isKnown;
}

module.exports = { isDeviceKnown };