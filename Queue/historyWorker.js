const { Worker } = require('bullmq');
const pool = require('../config/db');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

const historyWorker = new Worker(
  'history-updates',
  async (job) => {
    const { userId, deviceId, latitude, longitude, amount } = job.data;

    await pool.query(
      `INSERT INTO device_history (user_id, device_id, last_seen_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET last_seen_at = NOW()`,
      [userId, deviceId]
    );

    await pool.query(
      `INSERT INTO location_history (user_id, latitude, longitude, last_seen_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, latitude, longitude]
    );

    await pool.query(
      `INSERT INTO amount_baseline (user_id, min_amount, max_amount, last_updated_at)
       VALUES ($1, $2, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET 
         min_amount = LEAST(amount_baseline.min_amount, $2),
         max_amount = GREATEST(amount_baseline.max_amount, $2),
         last_updated_at = NOW()`,
      [userId, amount]
    );

    console.log(`History updated for user ${userId}`);
  },
  { connection }
);

historyWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

module.exports = historyWorker;