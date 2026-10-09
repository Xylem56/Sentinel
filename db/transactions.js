const {getBalanceMovedInWindow} = require ('../db/user');
const {encrypt} = require('../utils/encryption');

async function getRecentTransactionCount (pool, userId, minutes) {
    const result = await pool.query (
        `SELECT COUNT(*) AS count 
        FROM transactions  
        WHERE user_id =$1 
        AND created_at >= NOW() -INTERVAL '1 minute' * $2 `,
        [userId, minutes]
    );
    return Number(result.rows[0].count);
}


async function insertTransaction(pool, tx) {
  const encryptRecipient = encrypt(tx.recipientAccount);
  const result = await pool.query(
    `INSERT INTO transactions 
     (user_id, amount, device_id, latitude, longitude, recipient_account, balance_at_time, idempotency_key, decision, risk_score, reasons)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      tx.userId,
      tx.amount,
      tx.deviceId,
      tx.latitude,
      tx.longitude,
      tx.recipientAccount,
      tx.currentBalance,
      tx.idempotencyKey,
      tx.decision,
      tx.score,
      JSON.stringify(tx.reasons),
    ]
  );

  return result.rows[0];
}

module.exports = { insertTransaction, getRecentTransactionCount, getBalanceMovedInWindow };

