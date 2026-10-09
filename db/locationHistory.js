const { haversineDistance } = require('../utils/distance');
const redisClient = require('../config/redis');

async function isLocationKnown(pool, userId, latitude, longitude) {
  const cacheKey = `is-location-known:${userId}:${latitude}:${longitude}`;
  const cached = await redisClient.get(cacheKey);

  if (cached !== null) {
    return cached === "true";
  }

  const result = await pool.query(
    `SELECT latitude, longitude, last_seen_at 
     FROM location_history 
     WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    return null;
  }

  const tenMonthsAgo = new Date();
  tenMonthsAgo.setMonth(tenMonthsAgo.getMonth() - 10);

  const RADIUS_KM = 50;
  let isKnown = false;

  for (const row of result.rows) {
    const distance = haversineDistance(latitude, longitude, row.latitude, row.longitude);

    if (distance <= RADIUS_KM && new Date(row.last_seen_at) > tenMonthsAgo) {
      isKnown = true;
      break; 
    }
  }

  await redisClient.set(cacheKey, String(isKnown), "EX", 3600);

  return isKnown;
}

module.exports = { isLocationKnown };