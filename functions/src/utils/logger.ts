/**
 * Structured logger wrapper for Cloud Functions.
 *
 * Uses firebase-functions logger (which forwards to Cloud Logging).
 * Adds consistent metadata to every log entry.
 */

import * as functionsLogger from "firebase-functions/logger";

export interface LogMetadata {
  [key: string]: unknown;
}

export const logger = {
  info(message: string, meta?: LogMetadata): void {
    functionsLogger.info(message, meta);
  },

  warn(message: string, meta?: LogMetadata): void {
    functionsLogger.warn(message, meta);
  },

  error(message: string, error?: Error | unknown, meta?: LogMetadata): void {
    const errorMeta = error instanceof Error
      ? { errorMessage: error.message, errorStack: error.stack, ...meta }
      : { error, ...meta };
    functionsLogger.error(message, errorMeta);
  },

  debug(message: string, meta?: LogMetadata): void {
    functionsLogger.debug(message, meta);
  },
};
