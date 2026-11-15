// Genera public/_headers (cabeceras de seguridad y CSP con hashes de los scripts inline).
// Ejecutar después de editar index.html o guia.html:  node scripts/build-headers.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC = path.join(__dirname, '..', 'public');
const hashes = new Set();
for (const file of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.add("'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  }
}
const csp = ["default-src 'self'", "script-src 'self' " + [...hashes].join(' '), "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:", "connect-src 'self'", "font-src 'self' data:", "object-src 'none'",
  "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');

const out = `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: ${csp}
`;
fs.writeFileSync(path.join(PUBLIC, '_headers'), out);
console.log('public/_headers generado con', hashes.size, 'hash(es) de script');
