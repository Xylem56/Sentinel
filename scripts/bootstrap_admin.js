const bcrypt = require ('bcrypt');
const pool = require ('../config/db');
const {sendEmail} = require ('./admin_credentials')

async function adminBootstrap () {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        throw new Error ("ADMIN_EMAIL and ADMIN_PASSWORD are required");

    }

    const existingAdmin = await pool.query (
        `SELECT id FROM admins 
        WHERE email =$1`,
        [email]
    )
    if (existingAdmin.rows.length >0 ) {
        console.log('Admin already exists.');
        return;
    }
    const passwordHash =  await bcrypt.hash(password, 12);
    
    await pool.query (
        `INSERT INTO admins (email, hashed_password)
        VALUES ($1, $2)`,
        [email, passwordHash]
    );
    console.log(`Initial admin created: ${email}`)

   const code = Math.floor(100000 + Math.random() * 900000) .toString();

await pool.query (
    `UPDATE admins SET verification_code = $1, verification_code_expires_at = NOW() + INTERVAL '15 minutes'
     WHERE email = $2`,

    [code,email]
    
)
    await sendEmail (
        email,
        "Verify your Sentinel admin account",
        `Your verification code is: ${code}`
    );

}
adminBootstrap ()
.catch((err) => {
    console.error(err);
    process.exit(1);

})
.finally (() => {
    pool.end();
});
