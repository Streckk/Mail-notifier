/**
 * Punto de entrada del servicio.
 *
 * Arranca el cron y se queda vivo. Un fallo de envío nunca tumba el proceso.
 */

import { env } from './config/env.js';
import { closeMailClient, extractAddress, verifyGraphAccess } from './mail/graphClient.js';
import { describeNextRun, startDailyNotification } from './scheduler/dailyNotification.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('Servicio de autorización de audífonos iniciado');
  logger.info(`Timezone: ${env.schedule.timezone}`);
  logger.info(`Próximo envío configurado mediante: ${env.schedule.cronExpression}`);
  logger.info(`Destinatarios: ${env.mail.to.join(', ')}`);
  logger.info(`Guarda anti-duplicados: ${env.schedule.duplicateGuard}`);
  logger.info(`Remitente: ${extractAddress(env.mail.from)} (vía Microsoft Graph)`);

  if (env.verifyOnStartup && !env.mail.dryRun) {
    try {
      await verifyGraphAccess();
      logger.info('Acceso a Microsoft Graph verificado');
    } catch (error) {
      // No es fatal: el servicio puede estar temporalmente caído y el envío
      // programado volverá a intentarlo más tarde.
      logger.error('No se pudo verificar el acceso a Graph al arrancar', error);
    }
  }

  const task = startDailyNotification();
  logger.info(`Próxima ejecución programada: ${describeNextRun(task)}`);

  const shutdown = (signal: string): void => {
    logger.info(`Señal ${signal} recibida; deteniendo el servicio`);
    void task.stop();
    closeMailClient();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Red de seguridad: se registra el problema pero el servicio sigue corriendo
  // para no perder los envíos de los días siguientes.
  process.on('unhandledRejection', (reason) => {
    logger.error('Promesa rechazada sin manejar', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Excepción no capturada', error);
  });
}

void main();
