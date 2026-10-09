async function getBalanceMovedInWindow (pool, userId, hours) {
    const result = await pool.query (
        `SELECT COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE user_id =$1
        AND created_at >= Now() - INTERVAL '1 hour' * $2`,
        [userId, hours]


    );
    return Number(result.rows[0].total);


}

module.exports = {getBalanceMovedInWindow};
