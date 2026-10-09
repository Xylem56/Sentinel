const express = require ('express');
const router = express.Router();
const pool = require ('../config/db');
const bcrypt = require ('bcrypt');
const jwt = require ('jsonwebtoken');


router.post('/v1/admin/verify', async (req, res) => {
    const {email, code} = req.body;

    if (!email || !code ) {
        return res.status(400).json({message: "Valid authentication are required"});
    }

    const result = await pool.query (
        `SELECT id, verification_code, verification_code_expires_at FROM admins
        WHERE email = $1`,
        [email]

    )
    if (result.rows.length === 0) {
        return res.status(404).json({message: "Admin not found"});

    }

    const admin = result.rows[0];

    if (new Date() > new Date(admin.verification_code_expires_at)) {
        return res.status(400).json({message: "Code has expired"});
    }

    if (admin.verification_code !== code) {
        return res.status(404).json({message: "Invalid verification code"});

    }
    await pool.query ( `
        UPDATE admins SET is_verified = true, verification_code = NULL 
        WHERE id = $1`,
        [admin.id]
    );

    res.status(200).json({message: "Admin Authentication successfull"});
});

router.post('/v1/admin/login', async (req, res) => {

    const {email, password} = req.body;

    if (!email || !password) {
        return res.status(400).json({message: "Both fields are required"});
}    

try {

    const result = await pool.query (
        " SELECT * FROM admins WHERE email = $1",
        [email]
    );
        const admin = result.rows[0];

    

    if (!admin) {
        return res.status(404).json({message: "Admin not found"});

    }
    const isPasswordValid = await bcrypt.compare(password, admin.hashed_password);
    if (!isPasswordValid) {
        return res.status(401).json({message: "Invalid password"});


    }
    if (!admin.is_verified) {
        return res.status(403).json({message: "Please verify your email before logging in"});
    }

    const token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({message: "Login Successful", token: token});

} catch (error) {
    res.status(500).json({message: "error logging in ", error: error.message});

}
});



module.exports = router;