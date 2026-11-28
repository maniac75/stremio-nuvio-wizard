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

// Mudanza (28-nov-2026): el wizard ahora es Mandrake y vive en NEW_ORIGIN. La dirección antigua
// redirige todo, pero conserva su API y, con ?legacy=1, la página completa durante 30 días para
// abrir los respaldos creados antes (están cifrados con la clave de la cuenta antigua).
const OLD_HOST = 'wizard.stremio-nuvio.workers.dev';
const NEW_ORIGIN = 'https://wizard.mandrake-setup.workers.dev';
const LEGACY_UNTIL = Date.parse('2026-12-29T03:00:00Z');

function redirectPage(target) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const safe = JSON.stringify(target).replace(/</g, '\\u003c');
  // El tema y el idioma viven en el navegador de la dirección antigua: se pasan a la nueva en la URL.
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Mandrake</title>' +
    '<noscript><meta http-equiv="refresh" content="0;url=' + target.replace(/"/g, '&quot;') + '"></noscript></head>' +
    '<body style="font-family:system-ui,sans-serif;padding:24px">Redirigiendo a <a href="' + target.replace(/"/g, '&quot;') + '">Mandrake</a>…' +
    '<script nonce="' + nonce + '">(function(){var t=' + safe + ',u;try{u=new URL(t);var th=localStorage.getItem("wizard-theme"),' +
    'la=localStorage.getItem("stremio-wizard-ui-language");u.searchParams.set("mig","1");if(th)u.searchParams.set("th",th);' +
    'if(la)u.searchParams.set("la",la);t=u.toString()+location.hash;}catch(e){t+=location.hash;}location.replace(t);})();</script></body></html>';
  return new Response(html, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  } });
}

function legacyRedirect(request, url) {
  if (url.hostname !== OLD_HOST || url.pathname.startsWith('/api/')) return null;
  const cookie = request.headers.get('Cookie') || '';
  const wantsLegacy = url.searchParams.get('legacy') === '1' || /(?:^|;\s*)mandrake_legacy=1/.test(cookie);
  if (wantsLegacy && Date.now() < LEGACY_UNTIL) return 'legacy';
  const target = NEW_ORIGIN + url.pathname + url.search;
  const accept = request.headers.get('Accept') || '';
  const isPage = request.method === 'GET' && accept.includes('text/html');
  return isPage ? redirectPage(target) : Response.redirect(target, 301);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const moved = legacyRedirect(request, url);
    if (moved === 'legacy') {
      const res = await env.ASSETS.fetch(request);
      if (url.searchParams.get('legacy') !== '1') return res;
      const out = new Response(res.body, res);
      out.headers.append('Set-Cookie', 'mandrake_legacy=1; Max-Age=86400; Path=/; Secure; HttpOnly; SameSite=Lax');
      return out;
    }
    if (moved) return moved;
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
