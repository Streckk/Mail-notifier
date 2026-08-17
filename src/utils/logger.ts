/**
 * Logger mínimo con timestamp en la zona horaria configurada.
 *
 * Formato: [2026-08-17 08:00:00] Mensaje
 */

import { env } from '../config/env.js';
import { formatDateTime } from './time.js';

function prefix(): string {
  return `[${formatDateTime(new Date(), env.schedule.timezone)}]`;
}

/** Extrae un mensaje legible de un error desconocido, sin volcar objetos SMTP completos. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code ? `${error.message} (code: ${code})` : error.message;
  }

  return String(error);
}

export const logger = {
  info(message: string): void {
    console.log(`${prefix()} ${message}`);
  },
  warn(message: string): void {
    console.warn(`${prefix()} ${message}`);
  },
  error(message: string, error?: unknown): void {
    const detail = error === undefined ? '' : `: ${describeError(error)}`;
    console.error(`${prefix()} ${message}${detail}`);
  },
};
