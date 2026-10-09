require ('dotenv').config();
const crypto = require ('crypto');
const pool = require ('../config/db');

async function createApiClient () {
    const clientName = process.argv[2] || 'default_client';
    const rawKey = crypto.randomBytes(32).toString('hex');

    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

    await pool.query (
        ` INSERT INTO api_clients (client_name, hashed_key) VALUES ($1, $2)`,
        [clientName, hashedKey]

    )
    console.log(`API client created: ${clientName}`);
    console.log(`Raw API key (store this securely, it won't be shown again): ${rawKey}`);

}

createApiClient()
.catch((err) => {
    console.error(err);
    process.exit(1);

})

.finally(() => {
    pool.end();

});
