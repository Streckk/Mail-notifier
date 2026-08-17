/**
 * Envío manual de prueba: `npm run send:test`.
 *
 * Usa exactamente las mismas credenciales y la misma función de envío que el
 * cron. No arranca el scheduler y omite la guarda diaria a propósito, para
 * poder probar cuantas veces haga falta.
 *
 * El intento sí queda en la bitácora, marcado con `trigger: "manual"`, para
 * distinguirlo de los envíos programados.
 */

import { close as closeDatabase, connect as connectDatabase } from './db/notificationLog.js';
import { closeMailClient } from './mail/graphClient.js';
import { sendHeadphonesNotification } from './mail/sendHeadphonesNotification.js';
import { logger } from './utils/logger.js';

logger.info('Envío manual de prueba');

await connectDatabase();

try {
  await sendHeadphonesNotification(new Date(), 'manual');
} catch {
  // El detalle del error ya se registró en sendHeadphonesNotification.
  process.exitCode = 1;
} finally {
  closeMailClient();
  await closeDatabase();
}
