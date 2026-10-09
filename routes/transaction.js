const express = require('express');
const router = express.Router();
const { createTransaction } = require('../controller/transactionController');
const { writeAuditLog } = require('../db/auditLogs');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const authenticateApi = require('../middleware/Api_auth');
const { decrypt } = require('../utils/encryption');
const validateTransaction = require('../middleware/validateTransaction');

router.post("/v1/transactions", authenticateApi, validateTransaction, createTransaction);

router.get('/v1/flagged', authenticateToken, requireRole('admin'), async (req, res) => {
  const result = await pool.query(
    `SELECT id, user_id, amount, decision, risk_score, reasons, recipient_account, created_at FROM transactions 
     WHERE decision != 'approve' 
     ORDER BY created_at DESC`
  );

  const decryptedRows = result.rows.map(row => ({
    ...row,
    recipient_account: decrypt(row.recipient_account),
  }));

  res.status(200).json(decryptedRows);
});

router.post('/v1/flagged/:id/review', authenticateToken, requireRole('admin'), async (req, res) => {
  const { reviewedBy, finalDecision, notes } = req.body;
  const transactionId = req.params.id;

  if (!reviewedBy || !finalDecision || !notes) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if(!['approve', 'block'].includes(finalDecision)) {
    return res.status(400).json({message: "finalDecision mus be approve or block"});
  }

  const result = await pool.query(
    `UPDATE transactions 
     SET decision = $1
     WHERE id = $2
     RETURNING *`,
    [finalDecision, transactionId]
  );
  if (result.rows.length === 0 ) {
    return res.status(404).json({ message: "No reviewable transaction found with the provided ID" });
  }

  await writeAuditLog(pool, {
    transactionId,
    eventType: 'admin_review',
    decision: finalDecision,
    reasons: [notes, `admin:${req.user.id}`],
  });

  res.status(200).json({ message: "Review submitted", transaction: result.rows[0] });
});

router.get('/v1/users/:id/risk-profile',authenticateToken, requireRole('admin'), async (req, res) => {
  const userId = req.params.id;

  const baselineResult = await pool.query(
    `SELECT min_amount, max_amount FROM amount_baseline WHERE user_id = $1`,
    [userId]
  );

  const txCountResult = await pool.query(
    `SELECT COUNT(*) FROM transactions WHERE user_id = $1`,
    [userId]
  );

  const flaggedResult = await pool.query(
    `SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND decision != 'approve'`,
    [userId]
  );

  res.status(200).json({
    baseline: baselineResult.rows[0] || null,
    totalTransactions: Number(txCountResult.rows[0].count),
    flaggedTransactions: Number(flaggedResult.rows[0].count),
  });
});

router.get('/v1/transactions/:id',authenticateToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT * FROM transactions WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  const transaction = {
    ...result.rows[0],
    recipient_account: decrypt(result.rows[0].recipient_account),
  };

  res.status(200).json(transaction);
});

module.exports = router;