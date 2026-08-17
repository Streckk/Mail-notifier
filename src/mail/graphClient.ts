/**
 * Cliente de Microsoft Graph para el envío de correo.
 *
 * Se usa Graph en lugar de SMTP porque el tenant tiene SMTP AUTH deshabilitado
 * a nivel global (`535 5.7.139`), lo que bloquea el envío por SMTP con o sin
 * OAuth. Graph no usa SMTP AUTH, así que ese bloqueo no le aplica.
 *
 * Nodemailer se conserva para construir el mensaje: genera el MIME completo
 * —con las partes HTML y texto plano— y Graph solo lo entrega.
 *
 * Requisito en Entra ID: permiso de aplicación `Mail.Send` de Microsoft Graph
 * con consentimiento de administrador.
 *
 * Ni el client secret ni el access token se registran nunca en logs.
 */

import nodemailer from 'nodemailer';
import type { Options as MailOptions } from 'nodemailer/lib/mailer/index.js';

import { env } from '../config/env.js';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/** Margen de seguridad para renovar el token antes de que caduque. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Transporte que no envía: solo devuelve el MIME ya armado. */
const mimeBuilder = nodemailer.createTransport({
  streamTransport: true,
  buffer: true,
  newline: 'windows',
});

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Extrae la dirección de un remitente tipo `"Nombre <correo@dominio>"`. */
export function extractAddress(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim() ?? value.trim();
}

/** Resume un error de Entra ID o de Graph sin volcar la respuesta completa. */
function describeApiError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { code?: string; message?: string };
      error_description?: string;
    };

    const detail =
      typeof parsed.error === 'object'
        ? [parsed.error.code, parsed.error.message].filter(Boolean).join(': ')
        : (parsed.error_description?.split('\n')[0] ?? parsed.error);

    if (detail) return `HTTP ${status}: ${detail}`;
  } catch {
    // Respuesta no-JSON: se usa el status a secas.
  }

  return `HTTP ${status}`;
}

/** Obtiene un access token de Entra ID (client credentials), reutilizando el cacheado. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const { tenantId, clientId, clientSecret } = env.oauth;

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: GRAPH_SCOPE,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `No se pudo obtener el token de Entra ID (${describeApiError(response.status, await response.text())})`,
    );
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };

  if (!data.access_token) {
    throw new Error('Entra ID respondió sin access_token');
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - TOKEN_REFRESH_MARGIN_MS,
  };

  return data.access_token;
}

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${await getAccessToken()}`,
    },
  });
}

export interface SendResult {
  messageId: string;
  accepted: string[];
}

/** Envía el correo. El buzón remitente es la dirección de `MAIL_FROM`. */
export async function sendMail(options: MailOptions): Promise<SendResult> {
  const mailbox = extractAddress(env.mail.from);

  const built = await mimeBuilder.sendMail(options);
  const mime = built.message as Buffer;

  const response = await graphFetch(`/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: mime.toString('base64'),
  });

  if (!response.ok) {
    throw new Error(
      `Graph rechazó el envío (${describeApiError(response.status, await response.text())})`,
    );
  }

  return { messageId: built.messageId, accepted: env.mail.to };
}

/** Comprueba que el token sirve y que el buzón remitente es accesible. */
export async function verifyGraphAccess(): Promise<void> {
  const mailbox = extractAddress(env.mail.from);

  const response = await graphFetch(`/users/${encodeURIComponent(mailbox)}/mailFolders/inbox`);

  if (!response.ok) {
    throw new Error(
      `No se pudo acceder al buzón ${mailbox} vía Graph (${describeApiError(response.status, await response.text())})`,
    );
  }
}

/** Descarta el token cacheado (al apagar el servicio). */
export function closeMailClient(): void {
  cachedToken = null;
}
