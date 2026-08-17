/**
 * Envío manual de prueba: `npm run send:test`.
 *
 * Usa exactamente la misma configuración SMTP y la misma función de envío que
 * el cron. No arranca el scheduler y omite la guarda diaria a propósito, para
 * poder probar cuantas veces haga falta.
 */

import { closeMailClient } from './mail/graphClient.js';
import { sendHeadphonesNotification } from './mail/sendHeadphonesNotification.js';
import { logger } from './utils/logger.js';

logger.info('Envío manual de prueba');

try {
  await sendHeadphonesNotification();
} catch {
  // El detalle del error ya se registró en sendHeadphonesNotification.
  process.exitCode = 1;
} finally {
  closeMailClient();
}
