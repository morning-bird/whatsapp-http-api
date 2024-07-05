import { LogLevel } from '@nestjs/common';
import { ChildLoggerOptions, Level, Logger } from 'pino';

export interface LoggerBuilder {
  child(bindings: Record<string, any>, options?: ChildLoggerOptions): Logger;
}

function getNestJSLogLevels(): LogLevel[] {
  const level = getPinoLogLevel();
  switch (level) {
    case 'trace':
      return ['error', 'warn', 'log', 'debug', 'verbose'];
    case 'debug':
      return ['error', 'warn', 'log', 'debug'];
    case 'info':
      return ['error', 'warn', 'log'];
    case 'warn':
      return ['error', 'warn'];
    case 'error':
      return ['error', 'warn'];
    default:
      return ['error', 'warn', 'log'];
  }
}

export function getPinoLogLevel(debug: boolean = false): Level {
  const enableDebug = process.env.DEBUG != undefined || debug;
  if (enableDebug) {
    return 'debug';
  }
  return getDefaultPinoLogLevel();
}

export function getDefaultPinoLogLevel(): Level {
  const logLevel = (process.env.WAHA_LOG_LEVEL || 'info').toLowerCase();
  const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  if (!levels.includes(logLevel)) {
    console.error(
      `Unknown ${process.env.WAHA_LOG_LEVEL}' value for WAHA_LOG_LEVEL`,
    );
    return 'info';
  }
  return logLevel as Level;
}

export function getPinoTransport() {
  const logFormat = (process.env.WAHA_LOG_FORMAT || '').toUpperCase();
  if (!logFormat) {
    return;
  }
  if (logFormat == 'JSON') {
    return undefined;
  }
  if (logFormat == 'PRETTY') {
    return {
      target: 'pino-pretty',
      options: {
        singleLine: true,
        colorize: true,
      },
    };
  }
}

export { getNestJSLogLevels };
