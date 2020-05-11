const winston = require('winston');
const consoleTransport = new winston.transports.Console();

module.exports = winston.createLogger({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    consoleTransport
  ]
});