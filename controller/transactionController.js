const pool = require('../config/db');
const { evaluateTransaction } = require('../services/riskEngine');
const { insertTransaction } = require('../db/transactions');
const { writeAuditLog } = require('../db/auditLogs');
const historyQueue = require('../Queue/historyQueue');

async function createTransaction(req, res) {
  const client = await pool.connect();

  try {
    const tx = req.body;

    const existing = await client.query(
      `SELECT * FROM transactions WHERE idempotency_key = $1`,
      [tx.idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const prior = existing.rows[0];
      return res.status(200).json({
        transaction_id: prior.id,
        decision: prior.decision,
        risk_score: prior.risk_score,
        reasons: prior.reasons,
      });
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO users (id, current_balance) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET current_balance = $2, updated_at = NOW()`,
      [tx.userId, tx.currentBalance]
    );

    await client.query(
      `SELECT id FROM transactions 
       WHERE user_id = $1 
       AND created_at >= NOW() - INTERVAL '15 minutes' 
       FOR UPDATE`,
      [tx.userId]
    );

    const { decision, score, reasons } = await evaluateTransaction(client, tx);
    const savedTransaction = await insertTransaction(client, { ...tx, decision, score, reasons });

    await writeAuditLog(client, {
      transactionId: savedTransaction.id,
      eventType: 'decision',
      decision,
      reasons,
    });

    await client.query('COMMIT');


    if (decision === 'approve') {
      await historyQueue.add('update-history', {
        userId: tx.userId,
        deviceId: tx.deviceId,
        latitude: tx.latitude,
        longitude: tx.longitude,
        amount: tx.amount,
      });
    }

    res.status(200).json({
      transaction_id: savedTransaction.id,
      decision,
      risk_score: score,
      reasons,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Something went wrong processing this transaction' });

  } finally {
    client.release();
  }
}

module.exports = { createTransaction };