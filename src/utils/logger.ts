/**
 * Development-only logger. In production builds, log() is a no-op.
 * Use warn/error for messages that should appear in production.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  /** Debug messages — only visible in development */
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args); // eslint-disable-line no-console
  },
  /** Warnings — visible in all environments */
  warn: (...args: unknown[]): void => {
    console.warn(...args); // eslint-disable-line no-console
  },
  /** Errors — visible in all environments */
  error: (...args: unknown[]): void => {
    console.error(...args); // eslint-disable-line no-console
  },
};

export default logger;
