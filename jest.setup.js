require('dotenv').config();
const path = require('path');

const result = require('dotenv').config({
  path: path.resolve(__dirname, '.env'),
  override: true,
});

console.log('cwd:', process.cwd());
console.log('parsed keys:', result.parsed ? Object.keys(result.parsed) : result.error);
console.log('key present:', !!process.env.ENCRYPTION_KEY);