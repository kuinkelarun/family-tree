import winston from 'winston';

const { combine, timestamp, printf, json, colorize } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    process.env.NODE_ENV === 'production' ? json() : colorize({ all: true }),
  ),
  transports: [
    new winston.transports.Console({ format: process.env.NODE_ENV === 'production' ? json() : devFormat }),
  ],
});

export default logger;
