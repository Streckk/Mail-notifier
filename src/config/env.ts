/**
 * Carga y validación de la configuración.
 *
 * Se valida al arrancar (fail-fast): si falta una variable obligatoria o el
 * cron/timezone son inválidos, el proceso no debe llegar siquiera a programar
 * el envío. Ninguna credencial se registra en logs.
 */

import { config as loadDotenv } from 'dotenv';
import { validate as isValidCronExpression } from 'node-cron';

import { isValidTimeZone } from '../utils/time.js';

loadDotenv({ quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }

  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function toBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) return fallback;
  if (['true', '1', 'yes'].includes(value)) return true;
  if (['false', '0', 'no'].includes(value)) return false;

  throw new Error(`${name} debe ser true o false (recibido: "${value}")`);
}

/**
 * Modo de la guarda anti-duplicados:
 *  - `daily`: un envío exitoso por día calendario (para el cron diario).
 *  - `off`: sin guarda por día; útil con crons de alta frecuencia, donde cada
 *    disparo es intencional. `noOverlap` sigue activo en ambos casos.
 */
function toDuplicateGuard(name: string, fallback: 'daily' | 'off'): 'daily' | 'off' {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) return fallback;
  if (value === 'daily' || value === 'off') return value;

  throw new Error(`${name} debe ser "daily" u "off" (recibido: "${value}")`);
}

/** `MAIL_TO` admite varios destinatarios separados por coma. */
function toRecipients(name: string): string[] {
  const recipients = required(name)
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error(`${name} no contiene ningún destinatario válido`);
  }

  return recipients;
}

const timezone = optional('TIMEZONE', 'America/Monterrey');

if (!isValidTimeZone(timezone)) {
  throw new Error(`TIMEZONE no es una zona horaria IANA válida: "${timezone}"`);
}

const cronExpression = optional('CRON_EXPRESSION', '0 8 * * *');

if (!isValidCronExpression(cronExpression)) {
  throw new Error(`CRON_EXPRESSION no es una expresión cron válida: "${cronExpression}"`);
}

export const env = {
  /** Credenciales de la app registrada en Entra ID (permiso Mail.Send de Graph). */
  oauth: {
    tenantId: required('AZURE_TENANT_ID'),
    clientId: required('AZURE_CLIENT_ID'),
    clientSecret: required('AZURE_CLIENT_SECRET'),
  },
  mail: {
    from: required('MAIL_FROM'),
    to: toRecipients('MAIL_TO'),
    subject: optional('MAIL_SUBJECT', 'Autorización de ingreso de audífonos'),
    /** Simulacro: arma el correo y lo muestra, pero no lo envía ni abre conexión. */
    dryRun: toBoolean('MAIL_DRY_RUN', false),
  },
  /** Datos que alimentan la plantilla del correo. */
  request: {
    employeeName: optional('EMPLOYEE_NAME', 'Colaborador'),
    employeeDepartment: optional('EMPLOYEE_DEPARTMENT', ''),
    /** Los campos vacíos no se muestran en el correo. */
    device: {
      type: optional('DEVICE_TYPE', 'Audífonos personales'),
      brand: optional('DEVICE_BRAND', ''),
      model: optional('DEVICE_MODEL', ''),
      color: optional('DEVICE_COLOR', ''),
      serial: optional('DEVICE_SERIAL', ''),
    },
  },
  schedule: {
    cronExpression,
    timezone,
    duplicateGuard: toDuplicateGuard('DUPLICATE_GUARD', 'daily'),
  },
  /**
   * Bitácora en MongoDB. Opcional: sin `MONGODB_URI` el servicio funciona
   * igual, solo que la guarda anti-duplicados vive únicamente en memoria y no
   * queda historial.
   */
  mongo: {
    uri: optional('MONGODB_URI', ''),
    database: optional('MONGODB_DB', 'headphones_notifier'),
  },
  /** Verifica el acceso a Graph al arrancar (no bloquea el servicio si falla). */
  verifyOnStartup: toBoolean('VERIFY_ON_STARTUP', true),
} as const;

export type Env = typeof env;
