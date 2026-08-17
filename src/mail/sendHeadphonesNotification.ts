/**
 * Envío del correo de autorización de audífonos.
 *
 * Única función de envío del proyecto: la usa tanto el cron diario como el
 * script de prueba manual (`npm run send:test`).
 */

import { env } from '../config/env.js';
import { buildHeadphonesEmail } from '../templates/headphonesEmail.js';
import { logger } from '../utils/logger.js';
import { sendMail, type SendResult } from './graphClient.js';

export type { SendResult };

/**
 * Envía el correo y devuelve el resultado.
 * Registra el intento y el desenlace; propaga el error para que el llamador
 * decida qué hacer (el cron continúa vivo, el script de prueba sale con código 1).
 */
export async function sendHeadphonesNotification(issuedAt: Date = new Date()): Promise<SendResult> {
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

  try {
    const result = await sendMail({
      from: env.mail.from,
      to: env.mail.to,
      subject: env.mail.subject,
      text,
      html,
    });

    logger.info(
      `Correo enviado correctamente a ${result.accepted.join(', ')} (messageId: ${result.messageId})`,
    );

    return result;
  } catch (error) {
    logger.error('Error enviando correo', error);
    throw error;
  }
}
