const {Queue} = require ('bullmq');

const connect = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,

}
const historyQueue = new Queue ('history-updates', {connect});

module.exports = historyQueue;