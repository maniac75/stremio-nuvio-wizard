// Cloudflare Worker: sirve la API del wizard. Los archivos de public/ los entrega Workers Static Assets.
import core from './core.js';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

const MAX_BODY = 3_000_000;
const LOGIN_PATHS = new Set(['/api/connect', '/api/validate-key', '/api/check-setup']);
let configured = false;

function reply(status, body, extra) {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...(extra || {}) } });
}

async function allowed(limiter, key) {
  if (!limiter) return true;
  try { return (await limiter.limit({ key })).success; } catch { return true; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (!configured) {
      if (!env.BACKUP_KEY) return reply(500, { error: 'Falta configurar BACKUP_KEY en el servidor' });
      core.configure({ backupKey: env.BACKUP_KEY });
      configured = true;
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await allowed(env.API_LIMITER, ip)) ||
        (LOGIN_PATHS.has(url.pathname) && !(await allowed(env.LOGIN_LIMITER, ip)))) {
      return reply(429, { error: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.' }, { 'Retry-After': '60' });
    }

    let body = null;
    if (request.method === 'POST') {
      const length = Number(request.headers.get('Content-Length') || 0);
      if (length > MAX_BODY) return reply(413, { error: 'Solicitud demasiado grande' });
      const text = await request.text();
      if (text.length > MAX_BODY) return reply(413, { error: 'Solicitud demasiado grande' });
      try { body = text ? JSON.parse(text) : {}; } catch { return reply(400, { error: 'JSON inválido' }); }
    }

    // Sólo el código de país (2 letras) para las estadísticas anónimas; nada de ciudad ni IP.
    const result = await core.handleApi(request.method, url.pathname, body, { country: request.cf?.country });
    return result ? reply(result.status, result.body) : reply(404, { error: 'No encontrado' });
  }
};
