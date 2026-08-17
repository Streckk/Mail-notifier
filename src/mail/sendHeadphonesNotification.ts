/**
 * Envío del correo de autorización de audífonos.
 *
 * Única función de envío del proyecto: la usa tanto el cron diario como el
 * script de prueba manual (`npm run send:test`).
 */

import { env } from '../config/env.js';
import { recordFailed, recordPending, recordSent } from '../db/notificationLog.js';
import { buildHeadphonesEmail } from '../templates/headphonesEmail.js';
import { describeError, logger } from '../utils/logger.js';
import { getDayKey } from '../utils/time.js';
import { sendMail, type SendResult } from './graphClient.js';

export type { SendResult };

/**
 * Envía el correo y devuelve el resultado.
 * Registra el intento y el desenlace; propaga el error para que el llamador
 * decida qué hacer (el cron continúa vivo, el script de prueba sale con código 1).
 */
export async function sendHeadphonesNotification(
  issuedAt: Date = new Date(),
  trigger: 'scheduled' | 'manual' = 'manual',
): Promise<SendResult> {
  logger.info('Iniciando envío de autorización de audífonos');

  const { text, html } = buildHeadphonesEmail({
    employeeName: env.request.employeeName,
    employeeDepartment: env.request.employeeDepartment,
    device: env.request.device,
    issuedAt,
    timezone: env.schedule.timezone,
  });

  if (env.mail.dryRun) {
    logger.warn(`SIMULACRO (MAIL_DRY_RUN): no se envió nada. Iría a ${env.mail.to.join(', ')}`);
    logger.info(`Asunto: ${env.mail.subject}`);
    logger.info(`Vista previa:\n${text}`);

    return { messageId: '(simulacro)', accepted: env.mail.to };
  }

  // El intento queda registrado como `pending` antes de salir: si el proceso
  // muere a mitad del envío, el documento delata que algo quedó a medias.
  const recordId = await recordPending({
    dayKey: getDayKey(issuedAt, env.schedule.timezone),
    trigger,
    recipients: env.mail.to,
    subject: env.mail.subject,
    body: text,
  });

  try {
    const result = await sendMail({
      from: env.mail.from,
      to: env.mail.to,
      subject: env.mail.subject,
      text,
      html,
    });

    await recordSent(recordId, result.messageId);

    logger.info(
      `Correo enviado correctamente a ${result.accepted.join(', ')} (messageId: ${result.messageId})`,
    );

    return result;
  } catch (error) {
    await recordFailed(recordId, describeError(error));
    logger.error('Error enviando correo', error);
    throw error;
  }
}
