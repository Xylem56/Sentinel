const crypto = require ('crypto');
const pool = require ('../config/db');

async function authenticateApi(req, res, next) {
    const rawKey = req.headers ['x-api-key'];

    if (!rawKey) {
        return res.status(401).json ({message: "API key required"});
    }
        const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

        const result = await pool.query (`
            SELECT id, client_name FROM api_clients 
            WHERE hashed_key = $`, 
        [hashedKey]
        );
        if (result.rows.length === 0) {
            return res.status(403).json({message: "Invalid API key"});

        }

        req.apiClient = result.rows[0];
        next();
    

}
module.exports = authenticateApi;