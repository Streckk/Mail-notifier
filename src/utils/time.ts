/**
 * Utilidades de fecha/hora.
 *
 * Todo el formateo se hace contra una zona horaria explícita (IANA), nunca
 * contra la del sistema operativo: el contenedor puede correr en UTC y las
 * fechas mostradas/comparadas deben seguir siendo las de America/Monterrey.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }

  return formatter;
}

function getParts(date: Date, timeZone: string): Record<string, string> {
  const parts: Record<string, string> = {};

  for (const part of getFormatter(timeZone).formatToParts(date)) {
    parts[part.type] = part.value;
  }

  return parts;
}

/** Verifica que una zona horaria IANA sea reconocida por el runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Devuelve `YYYY-MM-DD HH:mm:ss` en la zona horaria indicada. */
export function formatDateTime(date: Date, timeZone: string): string {
  const p = getParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Devuelve `DD/MM/YYYY HH:mm` en la zona horaria indicada (para el correo). */
export function formatHumanDateTime(date: Date, timeZone: string): string {
  const p = getParts(date, timeZone);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * Clave de día calendario (`YYYY-MM-DD`) en la zona horaria indicada.
 * Se usa como guarda anti-duplicados: un envío por día local.
 */
export function getDayKey(date: Date, timeZone: string): string {
  const p = getParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Suma horas a una fecha sin mutar la original. */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
