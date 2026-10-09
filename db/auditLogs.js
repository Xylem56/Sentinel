const crypto = require('crypto');

function computeHash(data, previousHash) {
  const payload = JSON.stringify(data) + previousHash;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

async function writeAuditLog(pool, { transactionId, eventType, decision, reasons }) {
  
  const lastEntry = await pool.query(
    `SELECT current_hash FROM audit_logs ORDER BY created_at DESC LIMIT 1`
  );

  const previousHash = lastEntry.rows.length > 0 
    ? lastEntry.rows[0].current_hash 
    : 'genesis';


  const entryData = { transactionId, eventType, decision, reasons, timestamp: new Date().toISOString() };
  const currentHash = computeHash(entryData, previousHash);


  const result = await pool.query(
    `INSERT INTO audit_logs 
     (transaction_id, event_type, decision, reasons, previous_hash, current_hash) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING *`,
    [transactionId, eventType, decision, JSON.stringify(reasons), previousHash, currentHash]
  );

  return result.rows[0];
}

module.exports = { writeAuditLog };