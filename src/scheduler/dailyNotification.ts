/**
 * Programación del envío diario.
 *
 * Prevención de duplicados en dos capas:
 *  1. `noOverlap: true` de node-cron: si una ejecución sigue en curso cuando
 *     toca la siguiente, node-cron no la dispara.
 *  2. Guarda por día calendario en la zona horaria configurada: aunque la
 *     tarea se invoque más de una vez el mismo día (p. ej. `task.execute()`),
 *     solo se envía el primer correo del día. Se desactiva con
 *     `DUPLICATE_GUARD=off`, necesario si el cron dispara varias veces al día.
 *
 * El estado vive en memoria a propósito: una sola instancia, sin Redis ni BD.
 */

import { schedule, type ScheduledTask } from 'node-cron';

import { env } from '../config/env.js';
import { hasSentOn } from '../db/notificationLog.js';
import { sendHeadphonesNotification } from '../mail/sendHeadphonesNotification.js';
import { logger } from '../utils/logger.js';
import { formatDateTime, getDayKey } from '../utils/time.js';

const TASK_NAME = 'daily-headphones-notification';

/** Último día (YYYY-MM-DD en la TZ configurada) en el que se envió con éxito. */
let lastSentDayKey: string | null = null;

/**
 * ¿Ya se envió hoy? Se consulta primero la bitácora, que sobrevive a reinicios;
 * si no está disponible, se recurre al estado en memoria.
 */
async function alreadySentToday(dayKey: string): Promise<boolean> {
  const persisted = await hasSentOn(dayKey);

  return persisted ?? lastSentDayKey === dayKey;
}

async function runDailyNotification(triggeredAt: Date): Promise<void> {
  const dayKey = getDayKey(triggeredAt, env.schedule.timezone);

  if (env.schedule.duplicateGuard === 'daily' && (await alreadySentToday(dayKey))) {
    logger.warn(`El correo de ${dayKey} ya fue enviado; se omite este intento para evitar duplicados`);
    return;
  }

  try {
    await sendHeadphonesNotification(triggeredAt, 'scheduled');
    lastSentDayKey = dayKey;
  } catch {
    // El error ya se registró en sendHeadphonesNotification.
    // No se marca el día como enviado para permitir un reintento manual,
    // y el servicio sigue vivo esperando la siguiente ejecución programada.
    logger.warn('El servicio continúa activo; se reintentará en la próxima ejecución programada');
  }
}

/** Programa el envío diario y devuelve la tarea ya iniciada. */
export function startDailyNotification(): ScheduledTask {
  const task = schedule(
    env.schedule.cronExpression,
    (context) => runDailyNotification(context.triggeredAt ?? new Date()),
    {
      name: TASK_NAME,
      timezone: env.schedule.timezone,
      noOverlap: true,
    },
  );

  task.on('execution:overlap', () => {
    logger.warn('Ejecución omitida: el envío anterior seguía en curso');
  });

  return task;
}

/** Texto legible del próximo disparo, para el log de arranque. */
export function describeNextRun(task: ScheduledTask): string {
  const nextRun = task.getNextRun();
  return nextRun ? formatDateTime(nextRun, env.schedule.timezone) : 'sin próxima ejecución';
}
