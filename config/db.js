require('dotenv').config();

const {Pool} = require('pg');


const dbConfig = {
     connectionString: process.env.DATABASE_URL
};

const dbPool = new Pool(dbConfig);



module.exports = dbPool;