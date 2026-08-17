/**
 * Plantilla del correo de autorización de ingreso de audífonos.
 *
 * Este archivo es el único lugar donde vive el contenido del mensaje.
 * Para cambiar el texto o el diseño no hace falta tocar el scheduler ni el
 * transporter: basta con editar `buildHeadphonesEmail`.
 */

import { addHours, formatHumanDateTime } from '../utils/time.js';

/**
 * Datos del dispositivo. Todos son opcionales salvo el tipo: los que vengan
 * vacíos simplemente no se muestran, para no dejar líneas huérfanas.
 */
export interface DeviceDetails {
  /** Tipo de dispositivo, p. ej. "Audífonos over-ear inalámbricos". */
  type: string;
  brand: string;
  model: string;
  color: string;
  /** Número de serie: es lo que suele verificarse en la caseta de acceso. */
  serial: string;
}

export interface HeadphonesEmailInput {
  /** Nombre de quien ingresa los audífonos. */
  employeeName: string;
  /** Área o departamento (opcional; si viene vacío no se muestra). */
  employeeDepartment: string;
  device: DeviceDetails;
  /** Momento en que se genera la solicitud. */
  issuedAt: Date;
  /** Zona horaria usada para mostrar la vigencia. */
  timezone: string;
}

export interface HeadphonesEmailContent {
  text: string;
  html: string;
}

/** Escapa texto proveniente de configuración antes de interpolarlo en el HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildHeadphonesEmail(input: HeadphonesEmailInput): HeadphonesEmailContent {
  const { employeeName, employeeDepartment, device, issuedAt, timezone } = input;

  const validFrom = formatHumanDateTime(issuedAt, timezone);
  const validUntil = formatHumanDateTime(addHours(issuedAt, 24), timezone);

  // Las filas sin valor se descartan: así agregar o quitar un dato del correo
  // es solo cuestión de llenar o vaciar su variable de entorno.
  const details = (
    [
      ['Colaborador', employeeName],
      ['Área', employeeDepartment],
      ['Dispositivo', device.type],
      ['Marca', device.brand],
      ['Modelo', device.model],
      ['Color', device.color],
      ['Número de serie', device.serial],
      ['Vigencia', `${validFrom} — ${validUntil} (${timezone})`],
    ] satisfies Array<[string, string]>
  ).filter(([, value]) => value !== '');

  const text = [
    'Solicitud de autorización para ingreso de audífonos',
    '',
    'Por medio del presente notifico el ingreso de audífonos personales al lugar',
    'de trabajo, solicitando la autorización correspondiente por las siguientes',
    '24 horas.',
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    'Quedo atento a cualquier indicación adicional.',
    '',
    'Este correo se genera de forma automática y se renueva diariamente.',
  ].join('\n');

  const rows = details
    .map(
      ([label, value]) => `
            <tr>
              <td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td>
              <td style="padding:6px 0;color:#111827;font-weight:600;">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
      <tr>
        <td style="padding:24px;">
          <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">
            Solicitud de autorización para ingreso de audífonos
          </h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
            Por medio del presente notifico el ingreso de audífonos personales al lugar de
            trabajo, solicitando la autorización correspondiente por las siguientes
            <strong>24 horas</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-top:1px solid #e5e7eb;margin-bottom:16px;">${rows}
          </table>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
            Quedo atento a cualquier indicación adicional.
          </p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            Este correo se genera de forma automática y se renueva diariamente.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}
