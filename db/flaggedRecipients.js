const redisClient = require('../config/redis');

async function isRecipientFlagged(pool, recipientAccount) {
  const cacheKey = `flagged-recipient:${recipientAccount}`;
  const cached = await redisClient.get(cacheKey);

  if (cached !== null) {
    return cached === "none" ? null : JSON.parse(cached);
  }

  const result = await pool.query(
    `SELECT recipient_account, reason, flagged_at 
     FROM flagged_recipients
     WHERE recipient_account = $1`,
    [recipientAccount]
  );

  const flagged = result.rows.length === 0 ? null : result.rows[0];

  await redisClient.set(
    cacheKey,
    flagged === null ? "none" : JSON.stringify(flagged),
    "EX",
    3600
  );

  return flagged;
}

module.exports = { isRecipientFlagged };