'use strict';
// Servidor Node opcional (auto-alojamiento). La versión pública corre en Cloudflare Workers (worker.js).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const core = require('./core.js');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

function loadBackupKey() {
  if (process.env.BACKUP_KEY) return Buffer.from(process.env.BACKUP_KEY, 'base64');
  const keyFile = path.join(ROOT, 'data', 'wizard.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600 });
  return fs.readFileSync(keyFile);
}

core.configure({
  backupKey: loadBackupKey(),
  resolveHost: async host => (await dns.lookup(host, { all: true })).map(a => a.address)
});

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

function contentSecurityPolicy(html) {
  const hashes = [];
  for (const match of String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.push("'sha256-" + crypto.createHash('sha256').update(match[1], 'utf8').digest('base64') + "'");
  }
  return ["default-src 'self'", "script-src 'self' " + hashes.join(' '), "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:", "connect-src 'self'", "font-src 'self' data:", "object-src 'none'",
    "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
}

function send(res, status, body, type) {
  const isHtml = /^text\/html/.test(type);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isHtml ? { 'Content-Security-Policy': contentSecurityPolicy(body) } : {}),
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 3000000) { reject(new Error('Solicitud demasiado grande')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(pathname, res) {
  const file = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const full = path.join(PUBLIC, file);
  const ext = path.extname(full).toLowerCase();
  if (!full.startsWith(PUBLIC + path.sep) || !TYPES[ext] || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return false;
  send(res, 200, fs.readFileSync(full), TYPES[ext]);
  return true;
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    let body = null;
    if (req.method === 'POST') body = await readBody(req);
    const result = await core.handleApi(req.method, pathname, body);
    if (result) return send(res, result.status, JSON.stringify(result.body), 'application/json; charset=utf-8');
    if (req.method === 'GET' && serveStatic(pathname, res)) return;
    send(res, 404, JSON.stringify({ error: 'No encontrado' }), 'application/json; charset=utf-8');
  } catch (error) {
    send(res, 400, JSON.stringify({ error: error?.message || 'Error inesperado' }), 'application/json; charset=utf-8');
  }
}).listen(PORT, HOST, () => console.log('Stremio Wizard ' + core.WIZARD_VERSION + ' en http://localhost:' + PORT));
