const redisClient = require('../config/redis');

async function getAmountBaseline(pool, userId) {
  const cacheKey = `amount-baseline:${userId}`;
  const cached = await redisClient.get(cacheKey);

  if (cached !== null) {
    return JSON.parse(cached);
  }

  const result = await pool.query(
    'SELECT min_amount, max_amount, last_updated_at FROM amount_baseline WHERE user_id = $1',
    [userId]
  );

  let baseline = null;

  if (result.rows.length > 0) {
    const row = result.rows[0];
    const lastUpdated = new Date(row.last_updated_at);
    const now = new Date();
    const sixMonths = 6 * 30 * 24 * 60 * 60 * 1000;

    baseline = {
      minAmount: row.min_amount,
      maxAmount: row.max_amount,
      lastUpdatedAt: row.last_updated_at,
      isStale: (now - lastUpdated) > sixMonths,
    };
  }

  await redisClient.set(cacheKey, JSON.stringify(baseline), "EX", 3600);

  return baseline;
}

module.exports = { getAmountBaseline};