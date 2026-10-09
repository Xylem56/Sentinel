require ('dotenv').config();
const express = require ('express');
const app = express();
const pool = require('./config/db');
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(require('./routes/transaction'));
app.use(require('./routes/admin'));

app.listen(PORT, () => {
    console.log(`Server is listening at port ${PORT}..`)
});
