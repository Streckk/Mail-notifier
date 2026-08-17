/**
 * Bitácora de notificaciones en MongoDB.
 *
 * Guarda un documento por cada intento de envío, con su estado:
 *
 *   pending -> el recordatorio se creó y está por enviarse
 *   sent    -> Graph aceptó el correo
 *   failed  -> el envío falló (el motivo queda registrado)
 *
 * Dos cosas que aporta sobre el estado en memoria:
 *  - la guarda anti-duplicados sobrevive a reinicios del contenedor;
 *  - queda historial de qué se envió, cuándo y a quién.
 *
 * La persistencia es *best-effort*: si Mongo no está disponible, se registra el
 * problema y el servicio sigue enviando. El correo es la función principal; la
 * bitácora es contabilidad, y no debe poder tumbar el envío.
 */

import { MongoClient, type Collection, type ObjectId } from 'mongodb';

import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface NotificationRecord {
  _id?: ObjectId;
  /** Día calendario (`YYYY-MM-DD`) en la zona horaria configurada. */
  dayKey: string;
  status: NotificationStatus;
  /** `scheduled` si lo disparó el cron, `manual` si fue `npm run send:test`. */
  trigger: 'scheduled' | 'manual';
  recipients: string[];
  subject: string;
  /** Momento del intento, en UTC (Mongo siempre almacena en UTC). */
  attemptedAt: Date;
  sentAt?: Date;
  messageId?: string;
  error?: string;
}

const COLLECTION = 'notifications';

let client: MongoClient | null = null;
let collection: Collection<NotificationRecord> | null = null;

/** `true` si hay `MONGODB_URI` configurada y la conexión está viva. */
export function isEnabled(): boolean {
  return collection !== null;
}

/**
 * Abre la conexión y prepara los índices.
 * No lanza: si falla, el servicio queda sin bitácora pero sigue operando.
 */
export async function connect(): Promise<void> {
  if (!env.mongo.uri) return;

  try {
    client = new MongoClient(env.mongo.uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();

    const db = client.db(env.mongo.database);
    collection = db.collection<NotificationRecord>(COLLECTION);

    // dayKey resuelve la guarda anti-duplicados; status+attemptedAt, las consultas
    // de historial.
    await collection.createIndex({ dayKey: 1, status: 1 });
    await collection.createIndex({ attemptedAt: -1 });

    logger.info(`Bitácora en MongoDB conectada (${env.mongo.database}.${COLLECTION})`);
  } catch (error) {
    logger.error('No se pudo conectar a MongoDB; el servicio seguirá sin bitácora', error);
    await close();
  }
}

export async function close(): Promise<void> {
  collection = null;
  await client?.close().catch(() => undefined);
  client = null;
}

/** Registra un intento en estado `pending` y devuelve su id. */
export async function recordPending(
  input: Pick<NotificationRecord, 'dayKey' | 'trigger' | 'recipients' | 'subject'>,
): Promise<ObjectId | null> {
  if (!collection) return null;

  try {
    const result = await collection.insertOne({
      ...input,
      status: 'pending',
      attemptedAt: new Date(),
    });

    return result.insertedId;
  } catch (error) {
    logger.error('No se pudo registrar el intento en la bitácora', error);
    return null;
  }
}

/** Marca un intento como enviado. */
export async function recordSent(id: ObjectId | null, messageId: string): Promise<void> {
  if (!collection || !id) return;

  try {
    await collection.updateOne(
      { _id: id },
      { $set: { status: 'sent', sentAt: new Date(), messageId } },
    );
  } catch (error) {
    logger.error('No se pudo actualizar la bitácora tras el envío', error);
  }
}

/** Marca un intento como fallido, guardando el motivo. */
export async function recordFailed(id: ObjectId | null, reason: string): Promise<void> {
  if (!collection || !id) return;

  try {
    await collection.updateOne({ _id: id }, { $set: { status: 'failed', error: reason } });
  } catch (error) {
    logger.error('No se pudo actualizar la bitácora tras el fallo', error);
  }
}

/**
 * ¿Ya hubo un envío exitoso ese día?
 * Devuelve `null` si no hay bitácora disponible, para que el llamador use su
 * guarda en memoria en lugar de asumir que no se ha enviado.
 */
export async function hasSentOn(dayKey: string): Promise<boolean | null> {
  if (!collection) return null;

  try {
    return (await collection.countDocuments({ dayKey, status: 'sent' }, { limit: 1 })) > 0;
  } catch (error) {
    logger.error('No se pudo consultar la bitácora', error);
    return null;
  }
}

/** Conteo por estado, para el log de arranque. */
export async function countByStatus(): Promise<Record<NotificationStatus, number> | null> {
  if (!collection) return null;

  try {
    const rows = await collection
      .aggregate<{ _id: NotificationStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray();

    const totals: Record<NotificationStatus, number> = { pending: 0, sent: 0, failed: 0 };

    for (const row of rows) {
      totals[row._id] = row.count;
    }

    return totals;
  } catch (error) {
    logger.error('No se pudo consultar el resumen de la bitácora', error);
    return null;
  }
}
