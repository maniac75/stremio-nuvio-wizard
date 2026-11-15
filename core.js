'use strict';
// Núcleo del wizard, independiente del entorno (Node o Cloudflare Workers).
const crypto = require('node:crypto');
const BASELINE = require('./data/aio-baseline.json');

const BACKUP_RETENTION_DAYS = 30;
let BACKUP_KEY = null;          // Buffer de 32 bytes, lo entrega configure()
let RESOLVE_HOST = null;        // opcional (Node): resuelve DNS para bloquear IP privadas

// Registro sin URLs completas: pueden llevar claves Debrid o tokens.
function logError(...parts) {
  console.error(...parts.map(p => String(p?.message || p).replace(/https?:\/\/([^\/\s'"]+)[^\s'"]*/g, 'https://$1/…')));
}

function configure(options) {
  if (options.backupKey) {
    const key = Buffer.isBuffer(options.backupKey) ? options.backupKey : Buffer.from(String(options.backupKey), 'base64');
    if (key.length !== 32) throw new Error('BACKUP_KEY debe tener 32 bytes (base64)');
    BACKUP_KEY = key;
  }
  if (options.resolveHost) RESOLVE_HOST = options.resolveHost;
}

const AIO_BASE = 'https://aiostreamsfortheweebs.midnightignite.me';
const TAMTARO_URL = 'https://git.tamtaro.de/complete.json';
const PRESET_URL = 'https://raw.githubusercontent.com/DryKillLogic/stremio-account-bootstrapper/main/public/preset.json';
const LOCALE_ES_URL = 'https://raw.githubusercontent.com/DryKillLogic/stremio-account-bootstrapper/main/src/locales/es.json';
const AIOMETA_BASE = 'https://aiometadata.elfhosted.com';
const STREMIO_API = 'https://api.strem.io/api';
const WIZARD_VERSION = '0.14.0';
const NUVIO_API = 'https://api.nuvio.tv';
// Clave pública de aplicación de Nuvio; el usuario conserva sus credenciales.
const NUVIO_PUBLIC_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';

const MANAGED_IDS = new Set([
  'com.linvo.cinemeta',
  'org.streailer.trailer',
  'com.subsense.nepiraw',
  'community.opensubtitlesv3.pro',
  'community.anime.kitsu',
  'community.argentinatv'
]);

function isPrivateAddress(ip) {
  const v = String(ip || '').toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (v.includes(':')) {
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return true;
}

async function assertPublicUrl(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Protocolo no permitido');
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(local|lan|home|internal|localhost|ts\.net)$/.test(host)) {
    throw new Error('No se permiten direcciones locales: ' + host);
  }
  const isLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  const addresses = isLiteral ? [host] : (RESOLVE_HOST ? await RESOLVE_HOST(host) : []);
  if (addresses.some(isPrivateAddress)) {
    throw new Error('No se permiten direcciones locales o privadas: ' + host);
  }
}

async function fetchJson(url, options, timeoutMs) {
  await assertPublicUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 20000);
  try {
    const response = await fetch(url, { ...(options || {}), signal: controller.signal });
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error('Respuesta no JSON desde ' + new URL(url).host); }
    if (!response.ok) {
      const detail = body?.detail || body?.error?.message || body?.message || body?.error || ('HTTP ' + response.status);
      throw new Error(String(detail));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  const out = deepClone(target || {});
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(out[key] || {}, value);
    } else {
      out[key] = deepClone(value);
    }
  }
  return out;
}

function randomSecret(bytes) {
  return crypto.randomBytes(bytes || 24).toString('base64url');
}

function safeName(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

async function stremioPost(endpoint, payload) {
  return await fetchJson(STREMIO_API + '/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 20000);
}

async function stremioLogin(email, password) {
  const data = await stremioPost('login', { authKey: null, email, password });
  const authKey = data?.result?.authKey || data?.authKey;
  if (!authKey) throw new Error('No se pudo iniciar sesión en Stremio');
  return authKey;
}

async function stremioUser(authKey) {
  const data = await stremioPost('getUser', { authKey });
  if (data?.error) throw new Error(data.error.message || 'No se pudo identificar la cuenta de Stremio');
  const user = data?.result?.user || data?.result || data?.user;
  if (!user?._id) throw new Error('Stremio no devolvió un identificador de cuenta válido');
  return user;
}

async function nuvioRequest(endpoint, options) {
  return fetchJson(NUVIO_API + endpoint, {
    ...options,
    headers: { apikey: NUVIO_PUBLIC_KEY, 'Content-Type': 'application/json', ...(options?.headers || {}) }
  }, 20000);
}

async function resolveStremioAuth(body) {
  if (body?.platform === 'nuvio') {
    const email = String(body.email || '').trim(), password = String(body.password || '');
    if (!email || !password) throw new Error('Ingresa el correo y la contraseña de tu cuenta Nuvio');
    const login = await nuvioRequest('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    const authKey = String(login?.access_token || '');
    if (!authKey) throw new Error('Nuvio no devolvió una sesión válida');
    const profiles = await nuvioRequest('/rest/v1/rpc/sync_pull_profiles', {
      method: 'POST', headers: { Authorization: 'Bearer ' + authKey }, body: '{}'
    });
    if (!Array.isArray(profiles) || !profiles.length) throw new Error('Tu cuenta Nuvio no tiene perfiles disponibles');
    const requested = Number(body.profileId || profiles[0].profile_index);
    const profile = profiles.find(item => Number(item.profile_index) === requested);
    if (!profile) throw new Error('Selecciona un perfil existente de Nuvio');
    const payload = JSON.parse(Buffer.from(authKey.split('.')[1], 'base64url').toString('utf8'));
    if (!payload.sub) throw new Error('Nuvio no devolvió una cuenta válida');
    return { platform: 'nuvio', authKey, profileId: requested, profiles,
      identity: 'nuvio:user:' + payload.sub + ':profile:' + requested,
      legacyIdentities: [], mode: 'login' };
  }
  const pasted = String(body?.authKey || '').replaceAll('"', '').trim();
  const email = String(body?.email || '').trim();
  const password = String(body?.password || '');
  const authKey = pasted || (email && password ? await stremioLogin(email, password) : '');
  if (!authKey) throw new Error('Ingresa email y contraseña o pega una AuthKey de Stremio');
  const user = await stremioUser(authKey);
  const aliases = ['auth:' + hashText(authKey)];
  if (user.email || (!pasted && email)) aliases.push('email:' + String(user.email || email).toLowerCase());
  return {
    authKey,
    identity: 'user:' + String(user._id),
    legacyIdentities: aliases,
    mode: pasted ? 'authkey' : 'login'
  };
}

function accountOwnsBackup(auth, backup) {
  return [auth.identity, ...(auth.legacyIdentities || [])]
    .some(identity => backup.accountHash === hashText(identity));
}

// Los respaldos viven en el navegador del usuario; aquí sólo se validan los que envía.
async function accountBackups(auth, tokens) {
  const list = Array.isArray(tokens) ? tokens.slice(0, 12) : [];
  const out = [];
  for (const token of list) {
    try {
      const backup = await readBackup(token);
      if (!accountOwnsBackup(auth, backup)) continue;
      out.push({ id: token, label: backupLabel(backup), createdAt: backup.createdAt,
        count: Array.isArray(backup.addons) ? backup.addons.length : 0, aioProtected: !!backup.aioSnapshot });
    } catch {}
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getAddonCollection(auth) {
  const authKey = auth.authKey;
  if (auth.platform === 'nuvio') {
    const rows = await nuvioRequest('/rest/v1/addons?select=*&profile_id=eq.' + auth.profileId + '&order=sort_order', {
      headers: { Authorization: 'Bearer ' + authKey }
    });
    if (!Array.isArray(rows)) throw new Error('Nuvio no devolvió los complementos del perfil');
    return Promise.all(rows.map(async (row, index) => {
      const url = String(row.transportUrl || row.url || '');
      let manifest;
      try { manifest = await fetchJson(url, {}, 9000); }
      catch { manifest = { id: 'nuvio.existing.' + hashText(url || index), name: row.name || 'Complemento Nuvio', catalogs: [] }; }
      return { transportUrl: url, transportName: 'http', manifest, _nuvio: true,
        enabled: row.enabled !== false, sort_order: row.sort_order ?? index };
    }));
  }
  const data = await stremioPost('addonCollectionGet', {
    type: 'AddonCollectionGet',
    authKey,
    update: true
  });
  if (data?.error) {
    throw new Error(data.error.message || data.error.code || 'AuthKey de Stremio inválida');
  }
  const addons = data?.result?.addons ?? data?.addons;
  if (!Array.isArray(addons)) {
    throw new Error('Stremio no devolvió una colección válida de addons');
  }
  return addons;
}

function isArgentinaTvAddon(addon) {
  const id = String(addon?.manifest?.id || '').toLowerCase();
  const name = String(addon?.manifest?.name || '').toLowerCase();
  return id === 'community.argentinatv' || /^argentina\s*tv(?:\b|$)/.test(name);
}

function nuvioUrlKey(addon) {
  const raw = normalizeManifestUrl(addon?.transportUrl).trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch { return raw; }
}

function uniqueNuvioAddons(addons) {
  const seen = new Set();
  let argentinaTvIncluded = false;
  return addons.filter(addon => {
    const key = nuvioUrlKey(addon);
    if (!key || seen.has(key) || (argentinaTvIncluded && isArgentinaTvAddon(addon))) return false;
    seen.add(key);
    if (isArgentinaTvAddon(addon)) argentinaTvIncluded = true;
    return true;
  });
}

async function setAddonCollection(auth, addons) {
  const authKey = auth.authKey;
  if (auth.platform === 'nuvio') {
    const payload = uniqueNuvioAddons(addons).map((addon, index) => ({
      url: addon.transportUrl, name: addon.manifest?.name || 'Complemento',
      enabled: addon.enabled !== false, sort_order: index
    })).filter(item => !!item.url);
    const data = await nuvioRequest('/rest/v1/rpc/sync_push_addons', {
      method: 'POST', headers: { Authorization: 'Bearer ' + authKey },
      body: JSON.stringify({ p_profile_id: auth.profileId, p_addons: payload })
    });
    if (data?.success === false) throw new Error('Nuvio rechazó los complementos');
    return data;
  }
  const data = await stremioPost('addonCollectionSet', {
    type: 'AddonCollectionSet',
    authKey,
    addons
  });
  if (data?.error) {
    throw new Error(data.error.message || data.error.code || 'Stremio rechazó la colección');
  }
  if (data?.result?.success === false || data?.success === false) {
    const detail = data?.result?.error || data?.error || 'Stremio rechazó la colección';
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}

function backupKey() {
  if (!BACKUP_KEY) throw new Error('El servidor no tiene configurada la clave de respaldos');
  return BACKUP_KEY;
}

async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return Buffer.from(await new Response(stream).arrayBuffer());
}

// Formato: "b2." + base64url(iv[12] | tag[16] | AES-256-GCM(gzip(JSON)))
async function encryptBackup(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', backupKey(), iv);
  const plain = await gzipBytes(Buffer.from(JSON.stringify(payload), 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return 'b2.' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

async function decryptBackup(token) {
  const raw = String(token || '');
  if (!raw.startsWith('b2.')) throw new Error('Respaldo no válido o de una versión anterior. Crea uno nuevo.');
  const bytes = Buffer.from(raw.slice(3), 'base64url');
  if (bytes.length < 29) throw new Error('Respaldo no válido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  let plain;
  try { plain = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]); }
  catch { throw new Error('El respaldo fue alterado o no pertenece a este servidor'); }
  return JSON.parse((await gunzipBytes(plain)).toString('utf8'));
}

function collectionFingerprint(addons) {
  const list = Array.isArray(addons) ? addons : [];
  const content = list.length && list.every(addon => addon._nuvio)
    ? list.map(addon => ({ url: addon.transportUrl, enabled: addon.enabled, order: addon.sort_order }))
    : list;
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

async function backupCollection(identity, addons, aioSnapshot) {
  const createdAt = new Date().toISOString();
  return await encryptBackup({
    id: hashText(identity) + '-' + createdAt.replace(/[:.]/g, '-'),
    createdAt,
    accountHash: hashText(identity),
    fingerprint: collectionFingerprint(addons),
    addons,
    aioSnapshot: aioSnapshot || null
  });
}

async function readBackup(token) {
  if (!token) throw new Error('Falta el respaldo');
  const backup = await decryptBackup(token);
  const age = Date.now() - Date.parse(backup.createdAt);
  if (!(age >= -300000 && age <= BACKUP_RETENTION_DAYS * 86400000)) {
    throw new Error('Este respaldo venció (los respaldos duran ' + BACKUP_RETENTION_DAYS + ' días). Crea uno nuevo.');
  }
  return backup;
}

function backupLabel(backup) {
  return String(backup?.createdAt || '').replace('T', ' ').slice(0, 16) + ' UTC';
}

function addonSummary(addons) {
  return addons.map((a, index) => ({
    index: index + 1,
    name: a?.manifest?.name || 'Sin nombre',
    id: a?.manifest?.id || '',
    url: a?.transportUrl || '',
    catalogs: (a?.manifest?.catalogs || []).map(c => ({
      id: String(c.id || ''), type: String(c.type || ''), name: String(c.name || c.id || '')
    }))
  }));
}

function getNested(obj, key) {
  let cur = obj;
  for (const part of String(key).split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function jsString(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(jsString).join(',');
  if (typeof value === 'object') return '[object Object]';
  return String(value);
}

function truthy(value) {
  return value !== undefined &&
    value !== null &&
    value !== '' &&
    value !== false &&
    !(Array.isArray(value) && value.length === 0);
}

function evaluateCondition(condition, inputs, services) {
  const trimmed = String(condition || '').trim();
  const orParts = trimmed.split(/ or (?=!?(?:inputs|services)\b)/);
  if (orParts.length > 1) return orParts.some(p => evaluateCondition(p.trim(), inputs, services));
  const xorParts = trimmed.split(/ xor (?=!?(?:inputs|services)\b)/);
  if (xorParts.length > 1) return xorParts.filter(p => evaluateCondition(p.trim(), inputs, services)).length % 2 === 1;
  const andParts = trimmed.split(/ and (?=!?(?:inputs|services)\b)/);
  if (andParts.length > 1) return andParts.every(p => evaluateCondition(p.trim(), inputs, services));

  const negated = trimmed.startsWith('!');
  const expr = negated ? trimmed.slice(1).trim() : trimmed;
  let result = false;

  const num = expr.match(/^(\w+)\.(.+?)\s+(>=|<=|>|<)\s+(-?\d+(?:\.\d+)?)$/);
  if (num) {
    const [, ns, key, op, rhsRaw] = num;
    if (ns === 'inputs') {
      const lhs = Number(getNested(inputs, key));
      const rhs = Number(rhsRaw);
      if (!Number.isNaN(lhs)) {
        result = op === '>=' ? lhs >= rhs :
          op === '<=' ? lhs <= rhs :
          op === '>' ? lhs > rhs : lhs < rhs;
      }
    }
    return negated ? !result : result;
  }

  const op = expr.match(/^(\w+)\.(.+?)\s+(==|!=|includes)\s+(.+)$/);
  if (op) {
    const [, ns, key, operator, rhsRaw] = op;
    if (ns === 'inputs') {
      const lhs = getNested(inputs, key);
      const rhs = rhsRaw.trim();
      if (operator === '==') result = jsString(lhs) === rhs;
      else if (operator === '!=') result = jsString(lhs) !== rhs;
      else if (Array.isArray(lhs)) result = lhs.includes(rhs);
      else if (typeof lhs === 'string') result = lhs.includes(rhs);
    }
    return negated ? !result : result;
  }

  const dot = expr.indexOf('.');
  if (dot === -1) {
    result = expr === 'services' ? services.length > 0 : false;
    return negated ? !result : result;
  }

  const ns = expr.slice(0, dot);
  const key = expr.slice(dot + 1);
  if (ns === 'inputs') result = truthy(getNested(inputs, key));
  else if (ns === 'services') result = services.includes(key);
  return negated ? !result : result;
}

function resolveRef(ref, inputs, services) {
  const value = String(ref || '').trim();
  if (value === 'services') return services.slice();
  if (value.startsWith('inputs.')) return getNested(inputs, value.slice(7));
  if (value.startsWith('services.')) return services.includes(value.slice(9));
  return undefined;
}

const REMOVE = Symbol('remove');

function applyTemplate(value, inputs, services) {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      if (item && typeof item === 'object' && '__if' in item &&
          !evaluateCondition(item.__if, inputs, services)) continue;

      if (item && typeof item === 'object' && '__if' in item) {
        const rest = { ...item };
        delete rest.__if;
        if ('__value' in rest) {
          const v = applyTemplate(rest.__value, inputs, services);
          if (Array.isArray(v)) out.push(...v); else out.push(v);
          continue;
        }
        const v = applyTemplate(rest, inputs, services);
        if (Array.isArray(v)) out.push(...v); else out.push(v);
        continue;
      }

      if (item && typeof item === 'object' && '__value' in item) {
        const v = applyTemplate(item.__value, inputs, services);
        if (Array.isArray(v)) out.push(...v); else out.push(v);
        continue;
      }

      const v = applyTemplate(item, inputs, services);
      if (Array.isArray(v)) out.push(...v); else out.push(v);
    }
    return out;
  }

  if (value && typeof value === 'object') {
    if ('__switch' in value) {
      const resolved = resolveRef(value.__switch, inputs, services);
      const key = resolved === undefined || resolved === null ? null : String(resolved);
      const chosen = key !== null && value.cases && key in value.cases ?
        value.cases[key] : (value.default ?? null);
      return applyTemplate(chosen, inputs, services);
    }
    if ('__if' in value && '__value' in value) {
      return evaluateCondition(value.__if, inputs, services) ?
        applyTemplate(value.__value, inputs, services) : REMOVE;
    }
    if (value.__remove === true) return REMOVE;

    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const v = applyTemplate(child, inputs, services);
      if (v !== REMOVE) out[key] = v;
    }
    return out;
  }

  if (typeof value === 'string') {
    if (value === '{{services}}') return services.slice();
    const single = value.match(/^\{\{(inputs|services)\.([^}]+)\}\}$/);
    if (single) {
      const [, ns, key] = single;
      if (ns === 'inputs') {
        const v = getNested(inputs, key);
        return v === undefined || v === null ? '' : v;
      }
      if (key.includes('.')) return '{{services.' + key + '}}';
      return services.includes(key);
    }
    return value
      .replace(/\{\{services\}\}/g, services.join(','))
      .replace(/\{\{(inputs|services)\.([^}]+)\}\}/g, (_, ns, key) => {
        if (ns === 'inputs') {
          const v = getNested(inputs, key);
          return v === undefined || v === null ? '' : String(v);
        }
        if (key.includes('.')) return '{{services.' + key + '}}';
        return String(services.includes(key));
      });
  }
  return value;
}

function resolveCredentials(value, credentialValues) {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{services\.(\w[\w-]*)\.(\w[\w-]*)\}\}/g,
      (_, serviceId, credKey) => credentialValues['service_' + serviceId + '_' + credKey] || ''
    );
  }
  if (Array.isArray(value)) return value.map(v => resolveCredentials(v, credentialValues));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = resolveCredentials(child, credentialValues);
    return out;
  }
  return value;
}

function defaultsFromInputs(options) {
  const out = {};
  for (const option of options || []) {
    if (!option || typeof option !== 'object' || !option.id) continue;
    if (option.type === 'alert' || option.type === 'socials') continue;
    if (option.type === 'subsection') {
      const sub = defaultsFromInputs(option.subOptions || []);
      if (Object.keys(sub).length) out[option.id] = sub;
      else if ('default' in option) out[option.id] = deepClone(option.default);
    } else if ('default' in option) {
      out[option.id] = deepClone(option.default);
    }
  }
  return out;
}

function dedupeConfig(config) {
  if (Array.isArray(config.preferredLanguages)) {
    config.preferredLanguages = [...new Set(config.preferredLanguages)];
  }
  const sort = config.sortCriteria || {};
  for (const bucket of Object.keys(sort)) {
    if (!Array.isArray(sort[bucket])) continue;
    const seen = new Set();
    sort[bucket] = sort[bucket].filter(item => {
      const key = item && item.key;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return config;
}

function languageProfile(language) {
  const map = {
    'es-MX': {
      required: ['Latino', 'Spanish'],
      subtitles: ['Latino', 'Spanish', 'English'],
      primary: 'Latino',
      subtitleCodes: ['ea', 'es', 'sp', 'en']
    },
    'es-ES': {
      required: ['Spanish'],
      subtitles: ['Spanish', 'English'],
      primary: 'Spanish',
      subtitleCodes: ['es', 'sp', 'en']
    },
    'en': {
      required: ['English'],
      subtitles: ['English'],
      primary: 'English',
      subtitleCodes: ['en']
    }
  };
  return map[language] || map['es-MX'];
}

function buildTamtaroInputs(template, options) {
  const inputs = defaultsFromInputs(template?.metadata?.inputs || []);
  const lang = languageProfile(options.language);
  const hasDebrid = options.debrids.length > 0;

  inputs.languages = lang.required;
  inputs.strictLanguage = false;
  inputs.subtitles = lang.subtitles;
  inputs.addonPreset = 'default';
  inputs.includeAddon = {
    ...(inputs.includeAddon || {}),
    timeout: 5000,
    noAnime: options.anime === false,
    httpAddons: true,
    kdramaAddons: false,
    debridio: Boolean(options.debridioKey),
    p2pAddons: !hasDebrid,
    subtitleLanguages: lang.subtitleCodes
  };
  inputs.formatterChoice = 'Tamtaro (Default)';
  inputs.sorting = {
    ...(inputs.sorting || {}),
    '1080PRemuxBoost': 'default',
    library: 'default',
    selScore: 'default',
    language: 'default',
    subtitle: 'default',
    subLevels: 'default'
  };
  inputs.torboxTier = 'nonPro';
  inputs.coreFilterNonUsenet = 3;
  inputs.coreFilterUsenet = 3;
  inputs.coreFilterPriority = 'Merged';
  inputs.variants = 'includeVariants';
  inputs.deviceExclude = options.no4k ? ['4k'] : [];
  inputs.LanguagePassthrough = {
    ...(inputs.LanguagePassthrough || {}),
    language: lang.primary,
    languageAmount: 5,
    languagePin: false,
    languageAnimeOnly: false,
    subLanguage: 'none',
    subLanguageAmount: 5,
    subLanguagePin: false,
    subLanguageAnimeOnly: false
  };
  inputs.misc = {
    ...(inputs.misc || {}),
    keepScore: false,
    ignoreRSE: false,
    showStats: false,
    digitalRelease: false,
    addonName: 'AIOStreams',
    addonLogo: 'https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/refs/heads/main/logo/aios.png'
  };
  return inputs;
}

async function buildAioConfig(options) {
  const hasDebrid = options.debrids.length > 0;
  const document = await fetchJson(TAMTARO_URL);
  const template = document.find(x => x?.metadata?.id === 'tamtaro.complete');
  if (!template) throw new Error('No encontré el template Tamtaro Complete');

  const services = options.debrids.map(x => x.service);
  const inputs = buildTamtaroInputs(template, options);
  let config = applyTemplate(template.config, inputs, services);

  const credentialValues = {};
  for (const entry of options.debrids) {
    credentialValues['service_' + entry.service + '_apiKey'] = entry.key;
  }
  config = resolveCredentials(config, credentialValues);

  if (options.profileMode !== 'tamtaro') {
  const baseline = deepClone(BASELINE);
  if (!baseline.sortCriteria || !baseline.formatter || !Array.isArray(baseline.services)) {
    throw new Error('El perfil AIO base no es válido');
  }
  const generated = config;
  config = deepMerge(generated, baseline);
  if (options.debridioKey) {
    const additions = (generated.presets || []).filter(p => ['debridio', 'debridio-watchtower'].includes(p.type));
    config.presets = config.presets || [];
    for (const addon of additions) {
      if (!config.presets.some(p => p.type === addon.type)) config.presets.push(deepClone(addon));
    }
  }
  config.appliedTemplates = [
    { id: 'tamtaro.complete', version: template.metadata.version },
    { id: 'wizard.aiostreams.optimal.328', version: '1.0.0' },
    { id: 'wizard.aiostreams.restore.lightgdrive', version: '1.0.0' }
  ];
  if (options.language !== 'es-MX') {
    for (const key of ['requiredLanguages', 'preferredLanguages', 'requiredSubtitles', 'preferredSubtitles']) {
      if (key in generated) config[key] = deepClone(generated[key]);
    }
    config.sortCriteria = deepClone(generated.sortCriteria);
  }
  if (options.anime && 'presets' in generated) config.presets = deepClone(generated.presets);
  if (options.no4k) {
    config.excludedStreamExpressions = config.excludedStreamExpressions || [];
    const existing = new Set(config.excludedStreamExpressions.map(x => JSON.stringify(x)));
    for (const expr of generated.excludedStreamExpressions || []) {
      const key = JSON.stringify(expr);
      if (!existing.has(key)) { config.excludedStreamExpressions.push(deepClone(expr)); existing.add(key); }
    }
  }

  }

  if (options.debridioKey) {
    let configured = 0;
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (['debridio', 'debridio-watchtower'].includes(value.type) && value.options) {
        value.options.debridioApiKey = options.debridioKey;
        configured++;
      }
      Object.values(value).forEach(visit);
    };
    visit(config);
    if (!configured) throw new Error('La plantilla AIO no incluyÃ³ Debridio; no se aplicaron cambios.');
  }

  config.services = options.debrids.map(entry => ({
    id: entry.service,
    enabled: true,
    credentials: { apiKey: entry.key }
  }));
  config.formatter = { id: 'lightgdrive' };
  // Keep the tested quality/language/audio order, but do not prioritize Debrid when none exists.
  config.preferredStreamTypes = hasDebrid ? ['debrid', 'http', 'live', 'p2p'] : ['http', 'p2p', 'live'];
  config.preferredAudioChannels = ['7.1', '5.1'];
  if (!hasDebrid) {
    config.presets = (config.presets || []).filter(preset => preset?.type !== 'hdhub');
    for (const preset of config.presets || []) {
      if (preset?.options && Object.prototype.hasOwnProperty.call(preset.options, 'includeP2P')) {
        preset.options.includeP2P = true;
      }
    }
    config.excludeUncached = false;
    config.excludeUncachedFromAddons = [];
    config.excludeUncachedFromServices = [];
    config.excludeUncachedFromStreamTypes = [];
  }
  config.sortCriteria = config.sortCriteria || {};
  const globalSort = hasDebrid
    ? ['resolution', 'cached', 'streamType', 'quality', 'language', 'audioChannel', 'audioTag']
    : ['resolution', 'streamType', 'quality', 'language', 'audioChannel', 'audioTag'];
  config.sortCriteria.global = globalSort.map(key => ({ key, direction: 'desc' }));
  for (const bucket of ['cached', 'uncached']) {
    const criteria = config.sortCriteria[bucket];
    if (Array.isArray(criteria)) {
      config.sortCriteria[bucket] = [{ key: 'resolution', direction: 'desc' },
        ...criteria.filter(item => item.key !== 'resolution')];
    }
  }

  if (options.tmdbMode === 'personal' && options.tmdbKey) config.tmdbApiKey = options.tmdbKey;
  else delete config.tmdbApiKey;
  if (options.tvdbMode === 'personal' && options.tvdbKey) config.tvdbApiKey = options.tvdbKey;
  else delete config.tvdbApiKey;
  if (!options.tmdbKey) {
    if (config.yearMatching) config.yearMatching.enabled = false;
    if (config.titleMatching) config.titleMatching.enabled = false;
    config.bitrate = { ...(config.bitrate || {}), useMetadataRuntime: false };
  }
  if (options.cachedOnly && hasDebrid) config.excludeUncached = true;
  else if (!hasDebrid) config.excludeUncached = false;

  return {
    config: dedupeConfig(config),
    templateVersion: template.metadata.version
  };
}

const AIO_HOSTS = new Set([
  'aiostreams.fortheweak.cloud', 'aiostreams-nightly.fortheweak.cloud',
  'aiostreamsfortheweebsstable.midnightignite.me', 'aiostreamsfortheweebs.midnightignite.me',
  'aiostreams.elfhosted.com', 'aiostreams.viren070.me',
  'aiostreams.stremio.ru', 'aiostreams-nightly.stremio.ru',
  'aio.atbphosting.com', 'aiostreams.12312023.xyz'
]);
function parseAioManifest(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.port || !AIO_HOSTS.has(u.hostname)) return null;
    const match = u.pathname.match(/^\/stremio\/([^/]+)\/([^/]+)(?:\/v\/[^/]+)?\/manifest\.json$/);
    if (!match) return null;
    return { uuid: match[1], token: match[2], url, base: u.origin };
  } catch {
    return null;
  }
}

function basicAuth(user, pass) {
  return 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
}

async function rollbackAioChange(rollback) {
  if (!rollback) return;
  if (rollback.kind === 'updated') {
    await fetchJson(rollback.base + '/api/v1/user', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': basicAuth(rollback.uuid, rollback.token)
      },
      body: JSON.stringify({ config: rollback.previousConfig })
    }, 30000);
    return;
  }
  if (rollback.kind === 'created') {
    await fetchJson(AIO_BASE + '/api/v1/user', {
      method: 'DELETE',
      headers: { 'Authorization': basicAuth(rollback.uuid, rollback.password) }
    }, 30000);
  }
}

async function createOrUpdateAio(options, currentAddons) {
  const built = await buildAioConfig(options);
  const installed = findAioAddon(currentAddons);
  const parsed = installed && parseAioManifest(installed.transportUrl);
  const existing = options.aioInstallMode === 'update' && parsed &&
    (options.instanceMode === 'keep' || parsed.base === AIO_BASE)
    ? { addon: installed, parsed } : null;
  if (installed && options.aioInstallMode === 'update' && options.instanceMode === 'keep' && !parsed) {
    throw new Error('No se puede conservar AIO: su instancia no permite una actualización verificada. Elige cambiar a Midnight nightly.');
  }

  let manifestUrl;
  let recovery = null;
  let mode = 'created';
  let rollback = null;

  try {
    if (existing) {
      const { uuid, token, url, base } = existing.parsed;
      const adminPassword = options.aioPassword || token;
      const previous = await fetchJson(base + '/api/v1/user?raw=true', {
        headers: { 'Authorization': basicAuth(uuid, adminPassword) }
      }, 30000);
      const previousConfig = previous?.data?.userData;
      if (!previousConfig) throw new Error('No pude respaldar la configuración AIO actual');

      rollback = { kind: 'updated', base, uuid, token: adminPassword, previousConfig };
      await fetchJson(base + '/api/v1/user', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': basicAuth(uuid, adminPassword)
        },
        body: JSON.stringify({ config: built.config })
      }, 30000);
      manifestUrl = url;
      mode = 'updated';
    } else {
      if (installed) mode = 'migrated';
      const password = randomSecret(24);
      let created;
      try {
        created = await fetchJson(AIO_BASE + '/api/v1/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: built.config, password })
        }, 30000);
      } catch (error) {
        throw new Error('La instancia Midnight rechazó la creación de AIO: ' + error.message);
      }
      const uuid = created?.data?.uuid;
      const encrypted = created?.data?.encryptedPassword;
      if (!uuid || !encrypted) throw new Error('AIOStreams no devolvió UUID/token');
      manifestUrl = AIO_BASE + '/stremio/' + uuid + '/' + encrypted + '/manifest.json';
      recovery = { uuid, password, manifestUrl };
      rollback = { kind: 'created', uuid, password };
    }

    const manifest = await fetchJson(manifestUrl, {}, 30000);
    return {
      addon: { transportUrl: manifestUrl, transportName: 'http', manifest },
      recovery,
      rollback,
      mode,
      templateVersion: built.templateVersion
    };
  } catch (error) {
    if (rollback) {
      try { await rollbackAioChange(rollback); }
      catch (rollbackError) { logError('Falló rollback AIO:', rollbackError.message); }
    }
    throw error;
  }
}

async function validateMetadataOptions(options) {
  for (const service of ['tmdb', 'tvdb', 'rpdb']) {
    if (options[service + 'Mode'] === 'personal' && !options[service + 'Key']) {
      throw new Error('Ingresa tu API key de ' + service.toUpperCase() + ' o cambia la opción.');
    }
  }
  if (options.tmdbMode === 'instance' || options.tvdbMode === 'instance') {
    const available = await fetchJson(AIOMETA_BASE + '/api/config', {}, 12000);
    if (options.tmdbMode === 'instance' && available.hasBuiltInTmdb !== true) {
      throw new Error('La instancia de AIOMetadata no ofrece clave TMDB ahora. Usa tu propia clave.');
    }
    if (options.tvdbMode === 'instance' && available.hasBuiltInTvdb !== true) {
      throw new Error('La instancia de AIOMetadata no ofrece clave TVDB ahora. Usa tu propia clave.');
    }
  }
}

async function handleValidateKey(body) {
  const service = String(body?.service || '').toLowerCase();
  const key = String(body?.key || '').trim();
  const known = new Set(['tmdb', 'tvdb', 'rpdb', 'torbox', 'realdebrid', 'premiumize', 'alldebrid', 'debridlink', 'easydebrid']);
  if (!known.has(service)) throw new Error('Servicio de clave no reconocido');
  if (!key || key.length > 512 || /[\r\n]/.test(key)) return { status: 'invalid', message: 'Ingresa una clave válida.' };
  const unknown = { status: 'unknown', message: 'No hay una comprobación automática fiable para este servicio. Revisa que la clave esté completa.' };
  if (service === 'rpdb' || service === 'premiumize' || service === 'alldebrid' ||
      service === 'debridlink' || service === 'easydebrid') return unknown;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    let url, options = { signal: controller.signal };
    if (service === 'tmdb') {
      const v4 = key.startsWith('eyJ') || key.length > 80;
      url = 'https://api.themoviedb.org/3/configuration' + (v4 ? '' : '?api_key=' + encodeURIComponent(key));
      if (v4) options.headers = { Authorization: 'Bearer ' + key };
    } else if (service === 'tvdb') {
      url = 'https://api4.thetvdb.com/v4/login';
      options = { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apikey: key }) };
    } else if (service === 'torbox') {
      url = 'https://api.torbox.app/v1/api/user/me';
      options.headers = { Authorization: 'Bearer ' + key };
    } else {
      url = 'https://api.real-debrid.com/rest/1.0/user';
      options.headers = { Authorization: 'Bearer ' + key };
    }
    const response = await fetch(url, options);
    if (response.status === 401 || response.status === 403) {
      return { status: 'invalid', message: 'La clave fue rechazada por ' + service.toUpperCase() + '.' };
    }
    if (response.status === 429 || response.status >= 500) return { status: 'unknown', message: 'El servicio no pudo responder ahora. Prueba de nuevo más tarde.' };
    if (!response.ok) return unknown;
    const result = await response.json();
    if (service === 'tvdb' && !result?.data?.token) return { status: 'invalid', message: 'TVDB no aceptó esta API key.' };
    if (service === 'torbox' && result?.success === false) return { status: 'invalid', message: 'TorBox no aceptó esta API key.' };
    return { status: 'valid', message: 'Clave verificada con ' + service.toUpperCase() + '.' };
  } catch {
    return { status: 'unknown', message: 'No se pudo comprobar ahora. Comprueba la clave en el sitio del servicio.' };
  } finally {
    clearTimeout(timer);
  }
}

async function configureAioMetadata(preset, options) {
  const wrapper = deepClone(preset.aioMetadataConfig || {});
  const config = deepClone(wrapper.config || {});
  config.language = options.language;
  config.catalogs = deepClone((options.kids ? wrapper.catalogs?.kids : wrapper.catalogs?.standard) || config.catalogs || []);

  if (options.language.startsWith('es') && Array.isArray(config.catalogs)) {
    try {
      const locale = await fetchJson(LOCALE_ES_URL, {}, 12000);
      config.catalogs = config.catalogs.map(catalog => {
        const source = String(catalog.source || '');
        const type = String(catalog.type || '');
        const slug = String(catalog.name || '')
          .toLowerCase()
          .replace(/\s*&\s*/g, '_and_')
          .replace(/\+/g, '_plus')
          .replace(/\s+/g, '_')
          .replace(/[^\w_]/g, '');
        const key = 'catalogs_' + source + '_' + type + '_' + slug;
        return locale[key] ? { ...catalog, name: locale[key] } : catalog;
      });
    } catch (error) {
      logError('No pude traducir catálogos AIOMetadata:', error.message);
    }
  }

  if (options.kids) {
    config.ageRating = 'G';
    if (config.search?.engineEnabled) {
      config.search.engineEnabled['kitsu.search.series'] = false;
      config.search.engineEnabled['kitsu.search.movie'] = false;
    }
  }
  config.apiKeys = config.apiKeys || {};
  config.apiKeys.tmdb = options.tmdbMode === 'personal' ? options.tmdbKey : '';
  config.apiKeys.tvdb = options.tvdbMode === 'personal' ? options.tvdbKey : '';
  config.apiKeys.rpdb = options.rpdbMode === 'personal' ? options.rpdbKey : '';
  if (options.rpdbMode === 'personal') config.posterRatingProvider = 'rpdb';
  config.enableRatingPostersForLibrary = options.rpdbMode === 'personal';
  if (Array.isArray(config.catalogs) && options.rpdbMode !== 'personal') {
    config.catalogs = config.catalogs.map(c => ({ ...c, enableRatingPosters: false }));
  }

  const response = await fetchJson(AIOMETA_BASE + '/api/config/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, password: randomSecret(20) })
  }, 30000);
  if (!response?.success || !response?.installUrl) {
    throw new Error('AIOMetadata no devolvió una URL de instalación');
  }
  const manifest = await fetchJson(response.installUrl, {}, 30000);
  return { transportUrl: response.installUrl, transportName: 'http', manifest };
}

function presetAddon(preset, key, language) {
  const base = preset.languages?.en?.[key] || {};
  const local = preset.languages?.[language]?.[key] || {};
  const merged = deepMerge(base, local);
  if (!merged.transportUrl) throw new Error('Addon sin URL: ' + key);
  return merged;
}

function normalizeManifestUrl(value) {
  let url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('stremio://')) url = 'https://' + url.slice('stremio://'.length);
  return url;
}

async function customAddonFromUrl(value) {
  const url = normalizeManifestUrl(value);
  if (!/^https:\/\//i.test(url) || !/manifest\.json(?:[?#].*)?$/i.test(url)) {
    throw new Error('URL de addon inválida: ' + value);
  }
  const manifest = await fetchJson(url, {}, 20000);
  if (!manifest?.id || !manifest?.name) throw new Error('Manifest incompleto: ' + value);
  return { transportUrl: url, transportName: 'http', manifest };
}

function decodeTransportData(url) {
  const match = String(url).match(/(https?:\/\/[^/]+(?:\/[^/]+)*\/)([^/=]+={0,2})(\/manifest\.json)$/);
  if (!match) throw new Error('URL StremThru inválida');
  return {
    base: match[1],
    data: JSON.parse(Buffer.from(match[2], 'base64').toString('utf8')),
    suffix: match[3]
  };
}

async function buildStoreAddon(preset, entry) {
  const base = deepClone(preset.extras?.stremthrustore);
  if (!base?.transportUrl) throw new Error('StremThru Store no disponible');
  const decoded = decodeTransportData(base.transportUrl);
  decoded.data.store_name = entry.service;
  decoded.data.store_token = entry.key;
  const token = Buffer.from(JSON.stringify(decoded.data)).toString('base64');
  const url = decoded.base + token + decoded.suffix;
  const manifest = await fetchJson(url, {}, 20000);
  return { transportUrl: url, transportName: 'http', manifest };
}

function encodeTransportData(decoded, data) {
  return decoded.base + Buffer.from(JSON.stringify(data)).toString('base64') + decoded.suffix;
}

async function manifestAddon(addon, overrideUrl) {
  const url = overrideUrl || addon.transportUrl;
  const manifest = await fetchJson(url, {}, 25000);
  return {
    transportUrl: url,
    transportName: 'http',
    manifest
  };
}

function renderItTemplate(template, vars) {
  return String(template).replace(/\{\{it\.([^}]+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

async function buildStandaloneAddons(preset, options) {
  const selected = new Set(options.standaloneAddons || []);
  const out = [];
  const skipped = [];
  // Un complemento opcional caído o retirado no debe impedir toda la configuración.
  const optional = async (addon, url) => {
    try { return await manifestAddon(addon, url); }
    catch (error) {
      let host = 'complemento';
      try { host = new URL(url || addon.transportUrl).hostname; } catch {}
      skipped.push(host);
      logError('Complemento opcional omitido:', host, error);
      return null;
    }
  };
  const primary = options.debrids[0];

  if (selected.has('torrentio')) {
    if (!primary) throw new Error('Torrentio standalone requiere al menos un Debrid');
    const base = presetAddon(preset, 'torrentio', options.language);
    const transportUrl = renderItTemplate(base.transportUrl, {
      no4k: options.no4k ? '4k,' : '',
      maxSize: '',
      limit: 10,
      transportUrl:
        '|sort=qualitysize|debridoptions=' +
        (options.cachedOnly ? 'nodownloadlinks,' : '') +
        'nocatalog|' + primary.service + '=' + primary.key
    });
    const addon = await manifestAddon(base, transportUrl);
    addon.manifest.name = (addon.manifest.name || 'Torrentio') + ' | ' + primary.service;
    out.push(addon);
  }

  if (selected.has('comet')) {
    const base = presetAddon(preset, 'comet', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const data = {
      ...decoded.data,
      debridServices: options.debrids.map(d => ({ service: d.service, apiKey: d.key })),
      cachedOnly: options.cachedOnly,
      enableTorrent: options.debrids.length === 0,
      maxResultsPerResolution: 10,
      resolutions: {
        ...(decoded.data.resolutions || {}),
        r2160p: options.no4k ? false : (decoded.data.resolutions?.r2160p ?? true)
      }
    };
    out.push(await optional(base, encodeTransportData(decoded, data)));
  }

  if (selected.has('meteor')) {
    if (!primary) throw new Error('Meteor standalone requiere al menos un Debrid');
    const base = presetAddon(preset, 'meteor', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const langCode = options.language === 'es-MX' ? 'la' : options.language.slice(0, 2);
    const data = {
      ...decoded.data,
      cachedOnly: options.cachedOnly,
      maxResultsPerRes: 10,
      debridApiKey: primary.key,
      debridService: primary.service,
      languages: {
        ...(decoded.data.languages || {}),
        preferred: [langCode, 'multi']
      },
      resolutions: options.no4k
        ? (decoded.data.resolutions || []).filter(r => r !== '4k')
        : (decoded.data.resolutions || [])
    };
    out.push(await optional(base, encodeTransportData(decoded, data)));
  }

  if (selected.has('webstreamr')) {
    out.push(await optional(presetAddon(preset, 'webstreamrmbg', options.language)));
  }

  if (selected.has('sootiohttp')) {
    out.push(await optional(presetAddon(preset, 'sootiohttp', options.language)));
  }

  if (selected.has('hdhub')) {
    const torbox = options.debrids.find(d => d.service === 'torbox');
    if (!torbox) throw new Error('HdHub standalone requiere TorBox');
    const base = presetAddon(preset, 'hdhub', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const data = {
      ...decoded.data,
      torbox: torbox.key,
      content: options.language === 'es-MX' ? 'latin' : (decoded.data.content || ''),
      mq: 10
    };
    out.push(await optional(base, encodeTransportData(decoded, data)));
  }

  if (selected.has('tpbplus')) {
    out.push(await optional(presetAddon(preset, 'tpbplus', options.language)));
  }

  if (selected.has('jackettio')) {
    if (!primary) throw new Error('Jackettio standalone requiere al menos un Debrid');
    const base = presetAddon(preset, 'jackettio', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const data = {
      ...decoded.data,
      debridEntries: [primary],
      debridApiKey: primary.key,
      debridId: primary.service,
      hideUncached: options.cachedOnly,
      qualities: options.no4k
        ? (decoded.data.qualities || []).filter(q => Number(q) !== 2160)
        : (decoded.data.qualities || [])
    };
    out.push(await optional(base, encodeTransportData(decoded, data)));
  }

  if (selected.has('torrentsdb')) {
    const base = presetAddon(preset, 'torrentsdb', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const data = {
      ...decoded.data,
      sort: options.debrids.length ? 'qualitysize' : decoded.data.sort
    };
    for (const entry of options.debrids) data[entry.service] = entry.key;
    if (options.no4k) {
      data.qualityfilter = [
        ...(decoded.data.qualityfilter || []),
        '4k','brremux','hdrall','dolbyvisionwithhdr','dolbyvision'
      ];
    }
    out.push(await optional(base, encodeTransportData(decoded, data)));
  }

  if (selected.has('stremthru')) {
    const base = presetAddon(preset, 'stremthrutorz', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const codeMap = {
      realdebrid:'rd',
      alldebrid:'ad',
      premiumize:'pm',
      debridlink:'dl',
      torbox:'tb',
      easydebrid:'ed'
    };
    const data = {
      ...decoded.data,
      stores: options.debrids.length
        ? options.debrids.map(d => ({ c: codeMap[d.service] || d.service, t: d.key }))
        : [{ c:'p2p', t:'' }],
      cached: options.cachedOnly
    };
    out.push(await optional(base, encodeTransportData(decoded, data)));
  }

  if (selected.has('mediafusion')) {
    const base = deepMerge(
      preset.languages?.en?.mediafusion || {},
      preset.languages?.[options.language]?.mediafusion || {}
    );
    const config = deepClone(preset.mediafusionConfig || {});
    const langName = options.language === 'es-MX'
      ? 'Latino'
      : options.language === 'es-ES' ? 'Spanish' : 'English';

    if (Array.isArray(config.language_sorting)) {
      config.language_sorting = [
        langName,
        ...config.language_sorting.filter(x => x !== langName)
      ];
    }
    if (options.no4k && Array.isArray(config.selected_resolutions)) {
      config.selected_resolutions = config.selected_resolutions.filter(
        x => !['4k','2160p','1440p'].includes(String(x).toLowerCase())
      );
    }
    if (options.debrids.length) {
      const providers = options.debrids.map((d,index) => ({
        name: serviceNamesForMediaFusion(d.service),
        service: d.service,
        token: d.key,
        enable_watchlist_catalogs: false,
        qbittorrent_config: null,
        only_show_cached_streams: options.cachedOnly,
        use_mediaflow: true,
        sabnzbd_config: null,
        nzbget_config: null,
        nzbdav_config: null,
        easynews_config: null,
        priority: index,
        enabled: true
      }));
      config.streaming_providers = providers;
      config.streaming_provider = providers[0];
    }
    const encrypted = await fetchJson(
      'https://mediafusionfortheweebs.midnightignite.me/encrypt-user-data',
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(config)
      },
      30000
    );
    if (!encrypted?.encrypted_str) throw new Error('MediaFusion no devolvió una configuración válida');
    const url = 'https://mediafusionfortheweebs.midnightignite.me/' + encrypted.encrypted_str + '/manifest.json';
    out.push(await optional(base, url));
  }

  if (selected.has('cometa')) {
    const base = presetAddon(preset, 'comet', options.language);
    const decoded = decodeTransportData(base.transportUrl);
    const data = {
      ...decoded.data,
      debridServices: options.debrids.map(d => ({ service: d.service, apiKey: d.key })),
      cachedOnly: options.cachedOnly,
      enableTorrent: options.debrids.length === 0,
      maxResultsPerResolution: 10,
      languages: {
        ...(decoded.data.languages || {}),
        required: ['es'],
        preferred: ['es']
      }
    };
    const url =
      'https://cometa.stremx.net/' +
      Buffer.from(JSON.stringify(data)).toString('base64') +
      '/manifest.json';
    out.push(await optional(base, url));
  }

  if (selected.has('peerflix')) {
    const supportedPeerflix = new Set([
      'torbox','alldebrid','realdebrid','premiumize','debridlink','offcloud'
    ]);
    const peerDebrid = options.debrids.find(d => supportedPeerflix.has(d.service));
    if (!peerDebrid) throw new Error('Peerflix necesita un Debrid compatible');
    const parts = [
      'language=es',
      'qualityfilter=threed,vhs,screener',
      'limitpq=4',
      'sort=language,quality,size',
      'debridoptions=' + (options.cachedOnly ? 'nodownloadlinks,' : '') + 'nocatalog',
      peerDebrid.service + '=' + peerDebrid.key
    ];
    const url = 'https://addon.peerflix.mov/' + parts.join('%7C') + '/manifest.json';
    out.push(await optional({ transportUrl: url }, url));
  }

  if (selected.has('stremify')) {
    const providers = Buffer.from('cinehdplus,verhdlink').toString('base64');
    const url = 'https://stremify.hayd.uk/' + providers + '/manifest.json';
    out.push(await optional({ transportUrl: url }, url));
  }

  if (selected.has('animes')) {
    const url = 'https://pigamer37.alwaysdata.net/onAirCatalogs=animeav1/manifest.json';
    out.push(await optional({ transportUrl: url }, url));
  }

  if (selected.has('linkanol')) {
    const linkDebrid =
      options.debrids.find(d => d.service === 'torbox') ||
      options.debrids.find(d => d.service === 'alldebrid');
    if (!linkDebrid) {
      throw new Error('Linkañol automático requiere TorBox o AllDebrid');
    }
    const body = {
      host: '8bcec99c5d97-spanish-links-addon.baby-beamup.club'
    };
    body[linkDebrid.service + '_token'] = linkDebrid.key;
    const built = await fetchJson(
      'https://8bcec99c5d97-spanish-links-addon.baby-beamup.club/build-install-url',
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
      },
      30000
    );
    if (!built?.url) throw new Error('Linkañol no devolvió una URL de instalación');
    const url = String(built.url).replace(/^stremio:\/\//i, 'https://');
    out.push(await optional({ transportUrl: url }, url));
  }

  if (selected.has('pelis')) {
    if (!options.tmdbKey) {
      throw new Error('PeLis requiere una API key de TMDB');
    }
    const pelisDebrid =
      options.debrids.find(d => d.service === 'alldebrid') ||
      options.debrids.find(d => d.service === 'torbox');
    if (!pelisDebrid) {
      throw new Error('PeLis automático requiere TorBox o AllDebrid');
    }

    const form = new URLSearchParams();
    form.set('tmdb_token', options.tmdbKey);
    form.set('provider', pelisDebrid.service);
    form.set('debrid_token', pelisDebrid.key);
    form.set('catalogs_enabled', '1');
    form.set('catalog_movies', '1');
    form.set('catalog_series', '1');
    const resolutions = options.no4k
      ? ['1080p','720p','sd','other']
      : ['8k','4k','1080p','720p','sd','other'];
    for (const res of resolutions) form.append('resolutions', res);
    if (!options.cachedOnly) form.set('include_uncached', '1');

    const response = await fetch('https://enspanish.vercel.app/configure', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:form.toString(),
      redirect:'manual'
    });
    const location = response.headers.get('location') || '';
    if (![302,303].includes(response.status) || !location) {
      const raw = await response.text().catch(() => '');
      const alert = raw.match(/<div class="alert alert-error"[^>]*>[\s\S]*?<div>([\s\S]*?)<\/div>/i);
      const reason = alert ? alert[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : '';
      const safeReason = reason.replaceAll(options.tmdbKey, '[clave TMDB]').replaceAll(pelisDebrid.key, '[clave Debrid]');
      throw new Error('PeLis rechazó la configuración' + (safeReason ? ': ' + safeReason : ' (HTTP ' + response.status + ')'));
    }
    const match = location.match(/^\/([^/]+)\/configure/);
    if (!match) throw new Error('PeLis devolvió una respuesta inesperada');
    const url = 'https://enspanish.vercel.app/' + match[1] + '/manifest.json';
    out.push(await optional({ transportUrl: url }, url));
  }

  const result = out.filter(Boolean);
  result.skipped = skipped;
  return result;
}

function serviceNamesForMediaFusion(service) {
  const names = {
    realdebrid:'RealDebrid',
    alldebrid:'AllDebrid',
    premiumize:'Premiumize',
    debridlink:'DebridLink',
    torbox:'TorBox',
    easydebrid:'EasyDebrid'
  };
  return names[service] || service;
}

function isManagedAddon(addon) {
  const id = addon?.manifest?.id || '';
  const name = String(addon?.manifest?.name || '').toLowerCase();
  const url = String(addon?.transportUrl || '').toLowerCase();
  if (MANAGED_IDS.has(id) || isArgentinaTvAddon(addon)) return true;
  if (name.startsWith('aiostreams') || url.includes('aiostreams')) return true;
  if (name.startsWith('aiometadata') || url.includes('aiometadata')) return true;
  if (name.startsWith('store |') || (id.includes('stremthru') && name.includes('store'))) return true;
  return false;
}

function addonPlan(addon, options) {
  const id = String(addon?.manifest?.id || '');
  const name = String(addon?.manifest?.name || '');
  const low = name.toLowerCase();
  const url = String(addon?.transportUrl || '').toLowerCase();

  if (low.startsWith('aiostreams') || url.includes('aiostreams')) {
    return { action: 'replace', reason: options.aioInstallMode === 'new'
      ? 'Se instalará otro AIO en Midnight; el anterior no se modificará y su URL está en el respaldo.'
      : options.instanceMode === 'keep'
        ? 'Se actualiza el AIO en su instancia actual.'
        : 'Se cambiará a Midnight nightly si está en otra instancia.' };
  }
  if (low.startsWith('aiometadata') || url.includes('aiometadata')) {
    return { action: 'replace', reason: 'Se configurará AIOMetadata; si su clave TMDB compartida falla, se conservará la instalación actual.' };
  }
  if (id === 'com.linvo.cinemeta') {
    return { action: 'replace', reason: 'Se conserva Cinemeta en la versión base del wizard.' };
  }
  if (id === 'org.streailer.trailer') {
    return options.trailers
      ? { action: 'replace', reason: 'Se reinstala con el idioma elegido.' }
      : { action: 'remove', reason: 'Streailer está desactivado en el formulario.' };
  }
  if (id === 'com.subsense.nepiraw') {
    return options.subtitles
      ? { action: 'replace', reason: 'Se reinstala con el idioma elegido.' }
      : { action: 'remove', reason: 'SubSense está desactivado en el formulario.' };
  }
  if (id === 'community.opensubtitlesv3.pro') {
    return options.openSubtitles
      ? { action: 'replace', reason: 'Se reinstala con la configuración elegida.' }
      : { action: 'remove', reason: 'OpenSubtitles PRO está desactivado.' };
  }
  if (id === 'community.anime.kitsu') {
    return options.anime
      ? { action: 'replace', reason: 'Anime Kitsu seguirá instalado.' }
      : { action: 'remove', reason: 'Anime está desactivado.' };
  }
  if (isArgentinaTvAddon(addon)) {
    return options.argentinaTv
      ? { action: 'replace', reason: 'Argentina TV seguirá instalado.' }
      : { action: 'remove', reason: 'TV en vivo está desactivada.' };
  }
  if (low.startsWith('store |') || (id.includes('stremthru') && low.includes('store'))) {
    return options.stores
      ? { action: 'replace', reason: 'Se recrea según los Debrid seleccionados.' }
      : { action: 'remove', reason: 'Stores están desactivados.' };
  }

  const optionalMatchers = [
    ['torrentio', id === 'com.stremio.torrentio.addon', 'Torrentio standalone'],
    ['comet', low.startsWith('comet') || id.startsWith('stremio.comet.fast'), 'Comet standalone'],
    ['meteor', id === 'community.meteor', 'Meteor standalone'],
    ['webstreamr', id === 'webstreamr-mbg', 'WebStreamr'],
    ['sootiohttp', id === 'com.sootio.debrid-search', 'Sootio HTTP'],
    ['hdhub', id === 'com.stremio.HdHub', 'HdHub'],
    ['tpbplus', id === 'com.stremio.thepiratebay.plus', 'ThePirateBay+'],
    ['jackettio', id === 'jackettio.elfhosted.com', 'Jackettio'],
    ['torrentsdb', id === 'com.torrentsdb.addon', 'TorrentsDB'],
    ['stremthru', id === 'com.stremthru.torz', 'StremThru Torz'],
    ['mediafusion', id.startsWith('stremio.addons.mediafusion'), 'MediaFusion'],
    ['peerflix', id === 'com.keopps.peerflix', 'Peerflix'],
    ['cometa', id === 'stremio.cometa.fast' || low.startsWith('cometa'), 'Cometa'],
    ['stremify', id === 'com.stremify', 'Stremify.Hayd'],
    ['animes', id === 'com.animeflv.stremio.addon' || low === 'animes', 'AnimES'],
    ['linkanol', id === 'org.spanish.links' || low.includes('linkañol') || low.includes('linkanol'), 'Linkañol'],
    ['pelis', low === 'pelis' || low.startsWith('pelis '), 'PeLis']
  ];
  const selectedOptional = optionalMatchers.find(
    ([key, match]) => match && (options.standaloneAddons || []).includes(key)
  );
  if (selectedOptional) {
    return {
      action: 'replace',
      reason: selectedOptional[2] + ' está seleccionado y se actualizará con la configuración del wizard.'
    };
  }

  if (id === 'com.stremio.watchhub' && options.removeWatchHub) {
    return { action: 'remove', reason: 'WatchHub está marcado para eliminar.' };
  }
  return { action: 'ask', reason: 'Addon ajeno al wizard: tú decides si conservarlo.' };
}

async function buildDesiredAddons(options, currentAddons) {
  const preset = await fetchJson(PRESET_URL);
  const custom = [];
  const stores = [];

  for (const url of options.customAddons) {
    custom.push(await customAddonFromUrl(url));
  }

  if (options.stores) {
    for (const entry of options.debrids) {
      try { stores.push(await buildStoreAddon(preset, entry)); }
      catch (error) { logError('Store omitido:', error.message); }
    }
  }

  const staticDesired = [presetAddon(preset, 'cinemeta', options.language)];
  if (options.trailers) staticDesired.push(presetAddon(preset, 'streailer', options.language));
  if (options.subtitles) staticDesired.push(presetAddon(preset, 'subsense', options.language));
  if (options.openSubtitles) staticDesired.push(presetAddon(preset, 'opensubtitlespro', options.language));
  if (options.anime && preset.extras?.kitsu) staticDesired.push(deepClone(preset.extras.kitsu));
  if (options.argentinaTv && preset.extras?.argentinatv) staticDesired.push(deepClone(preset.extras.argentinatv));

  const standalone = await buildStandaloneAddons(preset, options);
  let metadata, metadataReused = false;
  try {
    metadata = await configureAioMetadata(preset, options);
  } catch (error) {
    const old = currentAddons.find(a => /aiometadata/i.test(String(a?.manifest?.name || '') + ' ' + String(a?.transportUrl || '')));
    if (!old || options.tmdbMode !== 'instance' || !/TMDB API Key\/Access Token.*401|401.*Unauthorized/i.test(error.message)) {
      throw new Error('AIOMetadata no pudo configurarse: ' + error.message + '. Si falla la clave compartida, usa una clave TMDB propia.');
    }
    metadata = deepClone(old);
    metadataReused = true;
    console.warn('AIOMetadata conservado: la instancia rechazó su clave TMDB compartida.');
  }
  const aio = await createOrUpdateAio(options, currentAddons);
  const desired = [
    ...(options.trailers ? [staticDesired[1]] : []),
    staticDesired[0],
    metadata,
    aio.addon,
    ...staticDesired.slice(options.trailers ? 2 : 1),
    ...standalone,
    ...stores,
    ...custom
  ];

  const seen = new Set();
  const unique = desired.filter(addon => {
    const key = String(addon?.manifest?.id || addon?.transportUrl || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const platformAddons = options.platform === 'nuvio'
    ? unique.filter(addon => !['com.linvo.cinemeta', 'org.streailer.trailer'].includes(addon?.manifest?.id))
    : unique;
  return { desired: platformAddons, aio, metadataReused, skippedAddons: standalone.skipped || [] };
}

const FREE_STANDALONE_ADDONS = new Set([
  'comet','webstreamr','sootiohttp','tpbplus','torrentsdb','stremthru',
  'mediafusion','cometa','animes'
]);

function normalizeOptions(body) {
  const noDebrid = body.noDebrid === true;
  const supported = new Set(['torbox', 'realdebrid', 'premiumize', 'alldebrid', 'debridlink', 'easydebrid']);
  const rawDebrids = !noDebrid && Array.isArray(body.debrids) ? body.debrids
    .map(x => ({
      service: String(x.service || '').trim(),
      key: String(x.key || '').trim()
    }))
    .filter(x => supported.has(x.service) && x.key) : [];
  const debrids = [];
  const seenServices = new Set();
  for (const entry of rawDebrids) {
    if (seenServices.has(entry.service)) continue;
    seenServices.add(entry.service);
    debrids.push(entry);
  }

  const custom = Array.isArray(body.customAddons) ? body.customAddons :
    String(body.customAddons || '').split(/\r?\n/);

  return {
    email: String(body.email || '').trim(),
    password: String(body.password || ''),
    authKey: String(body.authKey || '').replaceAll('"', '').trim(),
    platform: body.platform === 'nuvio' ? 'nuvio' : 'stremio',
    profileId: Number(body.profileId || 1),
    noDebrid,
    language: ['es-MX', 'es-ES', 'en'].includes(body.language) ? body.language : 'es-MX',
    profileMode: body.profileMode === 'tamtaro' ? 'tamtaro' : 'recommended',
    instanceMode: 'recommended',
    aioInstallMode: 'new',
    debrids,
    debridioKey: noDebrid ? '' : String(body.debridioKey || '').trim(),
    tmdbMode: body.tmdbMode === 'personal' ? 'personal' : (body.tmdbMode === 'instance' ? 'instance' : (body.tmdbKey ? 'personal' : 'instance')),
    tvdbMode: body.tvdbMode === 'personal' ? 'personal' : (body.tvdbMode === 'instance' ? 'instance' : (body.tvdbKey ? 'personal' : 'instance')),
    rpdbMode: body.rpdbMode === 'personal' ? 'personal' : (body.rpdbMode === 'none' ? 'none' : (body.rpdbKey ? 'personal' : 'none')),
    tmdbKey: body.tmdbMode === 'instance' ? '' : String(body.tmdbKey || '').trim(),
    tvdbKey: body.tvdbMode === 'instance' ? '' : String(body.tvdbKey || '').trim(),
    rpdbKey: body.rpdbMode === 'none' ? '' : String(body.rpdbKey || '').trim(),
    anime: body.anime === true,
    argentinaTv: body.argentinaTv === true,
    stores: noDebrid ? false : body.stores !== false,
    trailers: body.trailers !== false,
    subtitles: body.subtitles !== false,
    openSubtitles: body.openSubtitles !== false,
    kids: body.kids === true,
    no4k: body.no4k === true,
    cachedOnly: noDebrid ? false : body.cachedOnly === true,
    removeWatchHub: body.removeWatchHub !== false,
    customAddons: custom.map(normalizeManifestUrl).filter(Boolean),
    standaloneAddons: Array.isArray(body.standaloneAddons)
      ? [...new Set(body.standaloneAddons.map(String).filter(Boolean))]
          .filter(key => !noDebrid || FREE_STANDALONE_ADDONS.has(key))
      : [],
    keepIndices: Array.isArray(body.keepIndices)
      ? body.keepIndices.filter(x => Number.isInteger(x) && x >= 0)
      : null
  };
}

function configChangePaths(before, after, prefix = '', out = []) {
  if (out.length >= 40) return out;
  if (prefix && /(?:credentials|password|apiKey|token|secret)/i.test(prefix)) return out;
  if (JSON.stringify(before) === JSON.stringify(after)) return out;
  if (before && after && !Array.isArray(before) && !Array.isArray(after) &&
      typeof before === 'object' && typeof after === 'object') {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      configChangePaths(before[key], after[key], prefix ? prefix + '.' + key : key, out);
      if (out.length >= 40) break;
    }
  } else if (prefix) out.push(prefix);
  return out;
}

async function handleAnalyze(body) {
  const options = normalizeOptions(body);
  await validateMetadataOptions(options);
  const auth = await resolveStremioAuth(options);
  const addons = await getAddonCollection(auth);
  let aioPreview = null;
  if (body.preparedBackupId) {
    const prepared = await readBackup(String(body.preparedBackupId));
    if (!accountOwnsBackup(auth, prepared) ||
        prepared.fingerprint !== collectionFingerprint(addons)) {
      throw new Error('El backup ya no corresponde a esta cuenta o su colección cambió');
    }
    const proposed = await buildAioConfig(options);
    aioPreview = {
      profile: options.profileMode === 'tamtaro' ? 'Configuración predeterminada de Tamtaro' : 'Configuración recomendada',
      templateVersion: proposed.templateVersion,
      previousProtected: !!prepared.aioSnapshot,
      newInstallation: options.aioInstallMode === 'new',
      changedFields: prepared.aioSnapshot
        ? configChangePaths(prepared.aioSnapshot.config, proposed.config) : null
    };
    const installedAio = findAioAddon(addons);
    if (installedAio && options.aioInstallMode === 'update' && !prepared.aioSnapshot) {
      throw new Error('Para actualizar el AIO existente, adjunta su exportación JSON en el respaldo o elige instalar uno nuevo.');
    }
    const parsedInstalled = installedAio && parseAioManifest(installedAio.transportUrl);
    aioPreview.instance = {
      from: installedAio ? (() => { try { return new URL(installedAio.transportUrl).hostname; } catch { return 'desconocida'; } })() : null,
      to: options.aioInstallMode === 'update' && options.instanceMode === 'keep' && installedAio
        ? (() => { try { return new URL(installedAio.transportUrl).hostname; } catch { return 'desconocida'; } })()
        : new URL(AIO_BASE).hostname,
      changing: !!installedAio && (options.aioInstallMode === 'new' ||
        (options.instanceMode !== 'keep' && parsedInstalled?.base !== AIO_BASE))
    };
    if (parsedInstalled) {
      try {
        const live = await fetchJson(parsedInstalled.base + '/api/v1/user?raw=true', {
          headers: { Authorization: basicAuth(parsedInstalled.uuid, options.aioPassword || parsedInstalled.token) }
        }, 20000);
        const currentConfig = live?.data?.userData;
        if (!currentConfig) throw new Error('La instancia no devolvió la configuración');
        aioPreview.changedFields = configChangePaths(currentConfig, proposed.config);
        let liveStatus = null;
        try { liveStatus = await fetchJson(parsedInstalled.base + '/api/v1/status', {}, 8000); } catch {}
        aioPreview.push = {
          available: true, host: new URL(parsedInstalled.base).hostname,
          version: liveStatus?.data?.version || null, channel: liveStatus?.data?.channel || null,
          expectedHash: hashText(JSON.stringify(currentConfig)),
          proposedHash: hashText(JSON.stringify(proposed.config))
        };
      } catch (error) {
        aioPreview.push = { available: false, reason: 'No pude leer la configuración del AIO instalado' };
      }
    } else if (installedAio) {
      aioPreview.push = { available: false, reason: 'La URL de ese AIO no permite un push verificado desde el wizard' };
    }
    if (options.aioInstallMode === 'new' && installedAio) {
      aioPreview.push = { available: false, reason: 'Elegiste una instalación nueva. Aplicar en ' + (options.platform === 'nuvio' ? 'Nuvio' : 'Stremio') + ' creará otro AIO sin modificar el anterior' };
    } else if (aioPreview.instance.changing) {
      aioPreview.push = { available: false, reason: 'Elegiste cambiar de instancia. Configurar ' + (options.platform === 'nuvio' ? 'Nuvio' : 'Stremio') + ' hará la migración' };
    }
  }

  const aioAddon = addons.find(addon => {
    const name = String(addon?.manifest?.name || '').toLowerCase();
    const url = String(addon?.transportUrl || '').toLowerCase();
    return name.startsWith('aiostreams') || url.includes('aiostreams');
  });

  let aio = null;
  if (aioAddon) {
    const parsed = parseAioManifest(aioAddon.transportUrl);
    let host = '';
    try { host = new URL(aioAddon.transportUrl).hostname; } catch {}
    if (parsed) {
      try {
        const cfg = await fetchJson(parsed.base + '/api/v1/user?raw=true', {
          headers: { 'Authorization': basicAuth(parsed.uuid, options.aioPassword || parsed.token) }
        }, 20000);
        aio = {
          detected: true,
          compatibleInstance: true,
          host,
          uuid: parsed.uuid,
          appliedTemplates: cfg?.data?.userData?.appliedTemplates || [],
          services: (cfg?.data?.userData?.services || []).map(s => s.id)
        };
      } catch {
        aio = { detected: true, compatibleInstance: true, host, uuid: parsed.uuid, unreadable: true };
      }
    } else {
      aio = {
        detected: true,
        compatibleInstance: false,
        host,
        name: aioAddon?.manifest?.name || 'AIOStreams'
      };
    }
  }

  const seenInstalled = new Set();
  const plans = addons.map((addon, index) => {
    const summary = addonSummary([addon])[0];
    const identity = String(summary.id || summary.url || '').trim().toLowerCase();
    const duplicate = !!identity && seenInstalled.has(identity);
    if (identity) seenInstalled.add(identity);
    return { ...summary, index: index + 1, duplicate, ...addonPlan(addon, options) };
  });

  const ids = new Set(addons.map(a => String(a?.manifest?.id || '')));
  const names = new Set(addons.map(a => String(a?.manifest?.name || '').toLowerCase()));
  const additions = [];
  const addIfMissing = (present, name, reason) => {
    if (!present) additions.push({ name, action:'add', reason });
  };

  addIfMissing(!!aio, 'AIOStreams', 'Se creará el AIOStreams optimizado con Tamtaro y los Debrid seleccionados.');
  addIfMissing(
    [...names].some(n => n.startsWith('aiometadata')),
    'AIOMetadata',
    'Metadata, catálogos y posters.'
  );
  if (options.platform !== 'nuvio') {
    addIfMissing(ids.has('com.linvo.cinemeta'), 'Cinemeta', 'Base oficial para compatibilidad de Stremio.');
    if (options.trailers) addIfMissing(ids.has('org.streailer.trailer'), 'Streailer', 'Trailers y recaps.');
  }
  if (options.subtitles) addIfMissing(ids.has('com.subsense.nepiraw'), 'SubSense', 'Subtítulos multi-fuente.');
  if (options.openSubtitles) addIfMissing(ids.has('community.opensubtitlesv3.pro'), 'OpenSubtitles PRO', 'Proveedor adicional de subtítulos.');
  if (options.anime) addIfMissing(ids.has('community.anime.kitsu'), 'Anime Kitsu', 'Catálogos y metadata de anime.');
  if (options.argentinaTv) addIfMissing(ids.has('community.argentinatv'), 'Argentina TV', 'Canales en vivo.');

  const standaloneDefs = [
    ['torrentio','com.stremio.torrentio.addon','Torrentio standalone'],
    ['comet','__dynamic_comet__','Comet standalone'],
    ['meteor','community.meteor','Meteor standalone'],
    ['webstreamr','webstreamr-mbg','WebStreamr'],
    ['sootiohttp','com.sootio.debrid-search','Sootio HTTP'],
    ['hdhub','com.stremio.HdHub','HdHub'],
    ['tpbplus','com.stremio.thepiratebay.plus','ThePirateBay+'],
    ['jackettio','jackettio.elfhosted.com','Jackettio'],
    ['torrentsdb','com.torrentsdb.addon','TorrentsDB'],
    ['stremthru','com.stremthru.torz','StremThru Torz'],
    ['mediafusion','stremio.addons.mediafusion','MediaFusion'],
    ['peerflix','com.keopps.peerflix','Peerflix'],
    ['cometa','stremio.cometa.fast','Cometa'],
    ['stremify','com.stremify','Stremify.Hayd'],
    ['animes','com.animeflv.stremio.addon','AnimES'],
    ['linkanol','org.spanish.links','Linkañol'],
    ['pelis','__dynamic_pelis__','PeLis']
  ];
  for (const [key,id,label] of standaloneDefs) {
    if ((options.standaloneAddons || []).includes(key)) {
      let present;
      if (key === 'comet') present = [...names].some(n => n.startsWith('comet'));
      else if (key === 'pelis') present = [...names].some(n => n === 'pelis' || n.startsWith('pelis '));
      else present = ids.has(id);
      addIfMissing(
        present,
        label,
        ['peerflix','cometa','stremify','animes','linkanol','pelis'].includes(key)
          ? 'Complemento de la comunidad española seleccionado.'
          : 'Complemento standalone seleccionado como respaldo o alternativa.'
      );
    }
  }

  return {
    count: addons.length,
    addons: addonSummary(addons),
    plans,
    additions,
    aio,
    aioPreview,
    backups: await accountBackups(auth, body.storedBackups)
  };
}

async function handleConnect(body) {
  const auth = await resolveStremioAuth(body);
  const addons = await getAddonCollection(auth);
  return {
    ok: true,
    mode: auth.mode,
    platform: auth.platform || 'stremio',
    profileId: auth.profileId || 1,
    profiles: auth.profiles || [],
    ...(body.rememberOnDevice === true && auth.platform !== 'nuvio' ? { authKey: auth.authKey } : {}),
    count: addons.length,
    addons: addonSummary(addons),
    sourceFingerprint: collectionFingerprint(addons),
    backups: await accountBackups(auth, body.storedBackups)
  };
}

function findAioAddon(addons) {
  return addons.find(addon => {
    const name = String(addon?.manifest?.name || '').toLowerCase();
    const url = String(addon?.transportUrl || '').toLowerCase();
    return name.startsWith('aiostreams') || url.includes('aiostreams');
  });
}

async function readAioSnapshot(addons, supplied, password) {
  const aio = findAioAddon(addons);
  if (!aio) return { needed: false, snapshot: null, manageable: false };
  let host = '';
  try { host = new URL(aio.transportUrl).hostname; } catch {}
  let snapshot = null;
  if (supplied !== undefined && supplied !== null) {
    const config = supplied?.config || supplied?.data?.userData || supplied;
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        !config.sortCriteria || !Array.isArray(config.services)) {
      throw new Error('La exportación AIO no tiene una configuración válida');
    }
    snapshot = { host, config, source: 'imported' };
  }
  const parsed = parseAioManifest(aio.transportUrl);
  if (!parsed) return { needed: true, snapshot, host, manageable: false,
    reason: 'La URL instalada no permite administrar AIO desde el wizard' };
  try {
    const data = await fetchJson(parsed.base + '/api/v1/user?raw=true', {
      headers: { Authorization: basicAuth(parsed.uuid, password || parsed.token) }
    }, 15000);
    if (!data?.data?.userData) throw new Error('Configuración no disponible');
    if (!snapshot) snapshot = { host, config: data.data.userData, source: 'live' };
    return { needed: true, snapshot, host, manageable: true };
  } catch (error) {
    const needsRaw = /Encrypted password is not accepted here/i.test(error.message);
    return { needed: true, snapshot, host, manageable: false,
      reason: needsRaw
        ? 'Midnight exige la contraseña original de AIO y rechaza el token de la URL'
        : password ? 'La contraseña de AIO no fue aceptada o la instancia no respondió'
          : 'No se pudo autenticar con el token de la URL instalada' };
  }
}

async function handleBackup(body) {
  const auth = await resolveStremioAuth(body);
  const current = await getAddonCollection(auth);
  const aio = await readAioSnapshot(current, body.aioConfig);
  const backupId = await backupCollection(auth.identity, current, aio.snapshot);
  const verified = await readBackup(backupId);
  const fingerprint = collectionFingerprint(current);

  if (
    verified.accountHash !== hashText(auth.identity) ||
    verified.fingerprint !== fingerprint ||
    !Array.isArray(verified.addons) ||
    verified.addons.length !== current.length
  ) {
    throw new Error('El backup se creó pero no pasó la verificación de integridad');
  }

  return {
    ok: true,
    verified: true,
    backupId,
    backupLabel: backupLabel(verified),
    createdAt: verified.createdAt,
    count: current.length,
    fingerprint: fingerprint.slice(0, 12),
    aio: { needed: aio.needed, protected: !!aio.snapshot, manageable: aio.manageable,
      reason: aio.reason || null, source: aio.snapshot?.source || null,
      host: aio.host || aio.snapshot?.host || null },
    portable: { result: { addons: current }, aioConfig: aio.snapshot?.config || null }
  };
}

async function handleConfigure(body) {
  const options = normalizeOptions(body);
  await validateMetadataOptions(options);
  if (!options.noDebrid && options.debrids.length === 0) throw new Error('Agrega al menos un servicio Debrid o usa el modo gratuito');

  const preparedBackupId = String(body.preparedBackupId || '').trim();
  if (!preparedBackupId) throw new Error('Primero crea y verifica el backup seguro');

  const auth = await resolveStremioAuth(options);
  const current = await getAddonCollection(auth);
  const preparedBackup = await readBackup(preparedBackupId);

  if (!accountOwnsBackup(auth, preparedBackup)) {
    throw new Error('Ese backup pertenece a otra cuenta de Stremio');
  }
  if (!preparedBackup.fingerprint) {
    throw new Error('Ese backup es antiguo. Crea un backup seguro nuevo antes de configurar');
  }
  if (preparedBackup.fingerprint !== collectionFingerprint(current)) {
    throw new Error('La cuenta cambió después del backup. Vuelve a crear el backup antes de configurar');
  }

  if (options.aioInstallMode === 'update' && findAioAddon(current) &&
      !preparedBackup.aioSnapshot) {
    throw new Error('Para actualizar el AIO existente, respalda primero sus ajustes o elige una instalación nueva.');
  }

  const backupId = preparedBackupId;
  let built;
  try { built = await buildDesiredAddons(options, current); }
  catch (error) { throw new Error('Falló la preparación de los complementos: ' + error.message); }
  let collectionWritten = false;
  let stage = 'guardar la colección';
  try {
    const identity = addon => String(addon?.manifest?.id || '').trim().toLowerCase() ||
      String(addon?.transportUrl || '').trim().toLowerCase();
    const desiredIds = new Set(built.desired.map(identity).filter(Boolean));
    const selected = Array.isArray(options.keepIndices) ? new Set(options.keepIndices) : null;
    const seen = new Set(desiredIds);
    const installingArgentinaTv = built.desired.some(isArgentinaTvAddon);
    const preserved = current.filter((addon, index) => {
      if (installingArgentinaTv && isArgentinaTvAddon(addon)) return false;
      if (selected ? !selected.has(index) : (
        isManagedAddon(addon) ||
        (options.removeWatchHub && String(addon?.manifest?.id || '') === 'com.stremio.watchhub')
      )) return false;
      const key = identity(addon);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const managedCount = auth.platform === 'nuvio'
      ? uniqueNuvioAddons(built.desired).length : built.desired.length;
    const finalAddons = auth.platform === 'nuvio'
      ? uniqueNuvioAddons([...built.desired, ...preserved])
      : [...built.desired, ...preserved];
    collectionWritten = true;
    try { await setAddonCollection(auth, finalAddons); }
    catch (error) {
      if (auth.platform !== 'nuvio') throw error;
      // El RPC puede devolver 500 después de haber escrito; comprueba antes de restaurar.
      try {
        const afterError = await getAddonCollection(auth);
        if (JSON.stringify(afterError.map(a => a.transportUrl)) !==
            JSON.stringify(finalAddons.map(a => a.transportUrl))) throw error;
      } catch (readError) { throw error; }
    }
    stage = 'verificar la colección';
    const installed = await getAddonCollection(auth);
    const urls = list => list.map(a => String(a.transportUrl || ''));
    if (JSON.stringify(urls(installed)) !== JSON.stringify(urls(finalAddons))) {
      throw new Error('La colección instalada no coincide con el plan; se restaurará la anterior');
    }
    const [aioStatus, metadataStatus] = await Promise.allSettled([
      fetchJson(new URL(built.aio.addon.transportUrl).origin + '/api/v1/status', {}, 10000),
      fetchJson(AIOMETA_BASE + '/api/config', {}, 10000)
    ]);

    return {
      ok: true,
      backupId,
      backupLabel: backupLabel(preparedBackup),
      total: finalAddons.length,
      managed: managedCount,
      preserved: finalAddons.length - managedCount,
      addons: addonSummary(installed),
      verification: { collection: true,
        aioOnline: aioStatus.status === 'fulfilled',
        metadataOnline: metadataStatus.status === 'fulfilled' },
      aio: {
        mode: built.aio.mode,
        templateVersion: built.aio.templateVersion,
        recovery: built.aio.recovery
      },
      metadataReused: built.metadataReused,
      skippedAddons: built.skippedAddons,
      sourceFingerprint: collectionFingerprint(installed)
    };
  } catch (error) {
    let restoreFailed = false;
    if (collectionWritten) {
      try { await setAddonCollection(auth, current); }
      catch (restoreError) {
        restoreFailed = true;
        logError('Falló restauración ' + (auth.platform === 'nuvio' ? 'Nuvio' : 'Stremio') + ':', restoreError.message);
      }
    }
    let aioRollbackFailed = false;
    try { await rollbackAioChange(built.aio?.rollback); }
    catch (rollbackError) {
      aioRollbackFailed = true;
      logError('Falló rollback AIO:', rollbackError.message);
    }
    const restoration = restoreFailed ? ' No se pudo confirmar la restauración automática; comprueba el perfil antes de reintentar.' : '';
    const aioNotice = aioRollbackFailed ? ' La limpieza del AIO nuevo tampoco se confirmó.' : '';
    throw new Error('No se pudo ' + stage + ' en ' + (auth.platform === 'nuvio' ? 'Nuvio' : 'Stremio') + ': ' + error.message + '.' + restoration + aioNotice);
  }
}

function recordTransferActivity(activity) {
  try {
    console.log(JSON.stringify({ at: new Date().toISOString(), ...activity }));
  } catch (error) {
    logError('Could not write transfer activity:', error.message);
  }
}

function transferDesired(source, targetCurrent, targetPlatform) {
  const sourceAddons = source.map(addon => {
    const { _nuvio, sort_order, ...clean } = addon;
    return clean;
  });
  if (targetPlatform === 'nuvio') {
    return uniqueNuvioAddons(sourceAddons.filter(addon =>
      !['com.linvo.cinemeta', 'org.streailer.trailer'].includes(addon?.manifest?.id)));
  }
  // Stremio retains its own built-in metadata and trailer addons when Nuvio is the source.
  const builtins = targetCurrent.filter(addon =>
    ['com.linvo.cinemeta', 'org.streailer.trailer'].includes(addon?.manifest?.id));
  const seen = new Set();
  return [...builtins, ...sourceAddons].filter(addon => {
    const id = String(addon?.manifest?.id || '').toLowerCase();
    const key = id || nuvioUrlKey(addon);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function transferContext(body) {
  const sourcePlatform = body?.source?.platform === 'nuvio' ? 'nuvio' : 'stremio';
  const targetPlatform = body?.target?.platform === 'nuvio' ? 'nuvio' : 'stremio';
  if (sourcePlatform === targetPlatform) throw new Error('Selecciona la otra plataforma');
  const sourceAuth = await resolveStremioAuth(body.source);
  const source = await getAddonCollection(sourceAuth);
  if (!body.sourceFingerprint || collectionFingerprint(source) !== body.sourceFingerprint) {
    throw new Error('La lista de origen cambió desde la instalación. Revísala antes de copiar.');
  }
  if (sourcePlatform === 'nuvio' && targetPlatform === 'stremio' &&
      source.some(addon => String(addon?.manifest?.id || '').startsWith('nuvio.existing.'))) {
    throw new Error('Nuvio contiene complementos cuyo manifiesto no responde. No se copiaran datos incompletos a Stremio.');
  }
  const targetAuth = await resolveStremioAuth(body.target);
  const targetCurrent = await getAddonCollection(targetAuth);
  const desired = transferDesired(source, targetCurrent, targetPlatform);
  if (!findAioAddon(desired)) throw new Error('El origen no contiene AIOStreams; no se copiará una lista incompleta.');
  return { source, targetAuth, targetCurrent, desired, targetPlatform };
}

async function handleTransferCheck(body) {
  const { targetCurrent, desired, targetPlatform } = await transferContext(body);
  const urls = list => list.map(addon => String(addon.transportUrl || ''));
  const actual = urls(targetCurrent), proposed = urls(desired);
  return { ok: true, platform: targetPlatform,
    matches: JSON.stringify(actual) === JSON.stringify(proposed),
    actualCount: actual.length, proposedCount: proposed.length,
    sameAio: findAioAddon(targetCurrent)?.transportUrl === findAioAddon(desired)?.transportUrl };
}

async function handleTransferPreview(body) {
  const context = await transferContext(body);
  const { targetAuth, targetCurrent, desired, targetPlatform } = context;
  const backupId = await backupCollection(targetAuth.identity, targetCurrent, null);
  const backup = await readBackup(backupId);
  if (!accountOwnsBackup(targetAuth, backup) ||
      backup.fingerprint !== collectionFingerprint(targetCurrent) ||
      backup.addons.length !== targetCurrent.length) {
    throw new Error('No se pudo verificar el respaldo de la segunda cuenta');
  }
  recordTransferActivity({event: 'transfer_preview', target: targetPlatform, account: backup.accountHash.slice(0, 12),
    previous: targetCurrent.length, proposed: desired.length});
  return {
    ok: true, backupId, backupLabel: backupLabel(backup), platform: targetPlatform,
    previous: addonSummary(targetCurrent),
    desired: addonSummary(desired),
    count: desired.length,
    aioUrlReused: findAioAddon(desired).transportUrl
  };
}

async function handleTransferApply(body) {
  const context = await transferContext(body);
  const { targetAuth, targetCurrent, desired, targetPlatform } = context;
  const backupId = String(body.backupId || '');
  const backup = await readBackup(backupId);
  if (!accountOwnsBackup(targetAuth, backup) ||
      backup.fingerprint !== collectionFingerprint(targetCurrent)) {
    throw new Error('La segunda cuenta cambió después del respaldo. Revisa el plan de nuevo.');
  }
  let attempted = false;
  try {
    attempted = true;
    try { await setAddonCollection(targetAuth, desired); }
    catch (error) {
      if (targetPlatform !== 'nuvio') throw error;
      const after = await getAddonCollection(targetAuth);
      if (JSON.stringify(after.map(a => a.transportUrl)) !==
          JSON.stringify(desired.map(a => a.transportUrl))) throw error;
    }
    const installed = await getAddonCollection(targetAuth);
    if (JSON.stringify(installed.map(a => a.transportUrl)) !==
        JSON.stringify(desired.map(a => a.transportUrl))) {
      throw new Error('La lista instalada no coincide con el plan');
    }
    recordTransferActivity({event: 'transfer_verified', target: targetPlatform, account: backup.accountHash.slice(0, 12),
      total: installed.length, aioHash: crypto.createHash('sha256').update(findAioAddon(installed)?.transportUrl || '').digest('hex').slice(0, 12)});
    return { ok: true, backupId, backupLabel: backupLabel(backup), platform: targetPlatform,
      total: installed.length, addons: addonSummary(installed),
      aioUrlReused: findAioAddon(installed)?.transportUrl };
  } catch (error) {
    let restoration = '';
    if (attempted) {
      try { await setAddonCollection(targetAuth, targetCurrent); }
      catch { restoration = ' No se pudo confirmar la restauración; revisa la segunda cuenta.'; }
    }
    throw new Error('No se pudo copiar la colección en ' + targetPlatform +
      ': ' + error.message + '.' + restoration + ' La cuenta de origen no se modificó.');
  }
}
async function handleAioPush(body) {
  const options = normalizeOptions(body);
  if (options.aioInstallMode === 'new') throw new Error('La actualización directa de AIO no está disponible; el wizard instala uno nuevo.');
  await validateMetadataOptions(options);
  if (!options.debrids.length) throw new Error('Ingresa las claves Debrid antes de actualizar AIO');
  const auth = await resolveStremioAuth(options);
  const current = await getAddonCollection(auth);
  const prepared = await readBackup(String(body.preparedBackupId || ''));
  if (!accountOwnsBackup(auth, prepared) ||
      prepared.fingerprint !== collectionFingerprint(current)) {
    throw new Error('Crea un backup de la colección actual antes de actualizar AIO');
  }
  const addon = findAioAddon(current);
  const target = addon && parseAioManifest(addon.transportUrl);
  if (!target) throw new Error('No hay un AIO instalado en una instancia compatible para actualizar');
  if (options.instanceMode !== 'keep' && target.base !== AIO_BASE) {
    throw new Error('Elegiste cambiar de instancia: usa Configurar Stremio o elige mantener la actual');
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: basicAuth(target.uuid, options.aioPassword || target.token)
  };
  const previous = (await fetchJson(target.base + '/api/v1/user?raw=true',
    { headers }, 30000))?.data?.userData;
  if (!previous) throw new Error('No se pudo leer el AIO instalado');
  if (hashText(JSON.stringify(previous)) !== body.expectedHash) {
    throw new Error('AIO cambió después de la revisión. Revisa nuevamente antes de actualizar');
  }
  const built = await buildAioConfig(options);
  if (hashText(JSON.stringify(built.config)) !== body.proposedHash) {
    throw new Error('El template o las opciones cambiaron. Revisa nuevamente antes de actualizar');
  }
  if (JSON.stringify(previous) === JSON.stringify(built.config)) {
    return { ok: true, unchanged: true, host: new URL(target.base).hostname, manifestChanged: false };
  }
  const backupId = await backupCollection(auth.identity, current, {
    host: new URL(target.base).hostname, config: previous, source: 'pre-push'
  });
  if (!(await readBackup(backupId))?.aioSnapshot?.config) {
    throw new Error('No pude verificar la copia de AIO antes de actualizar');
  }
  let attempted = false;
  try {
    attempted = true;
    await fetchJson(target.base + '/api/v1/user', {
      method: 'PUT', headers, body: JSON.stringify({ config: built.config })
    }, 30000);
    const saved = (await fetchJson(target.base + '/api/v1/user?raw=true',
      { headers }, 30000))?.data?.userData;
    if (!saved || JSON.stringify(saved) !== JSON.stringify(built.config)) {
      throw new Error('AIO no confirmó la configuración enviada');
    }
    let manifestChanged = false;
    try {
      const latestManifest = await fetchJson(target.url, {}, 20000);
      const signature = manifest => JSON.stringify({
        id: manifest?.id, name: manifest?.name,
        resources: manifest?.resources, types: manifest?.types, catalogs: manifest?.catalogs
      });
      manifestChanged = signature(latestManifest) !== signature(addon.manifest);
    } catch {
      manifestChanged = true;
    }
    return { ok: true, backupId, host: new URL(target.base).hostname,
      templateVersion: built.templateVersion, manifestChanged };
  } catch (error) {
    if (attempted) {
      try {
        await fetchJson(target.base + '/api/v1/user', {
          method: 'PUT', headers, body: JSON.stringify({ config: previous })
        }, 30000);
      } catch (rollbackError) {
        throw new Error(error.message + '; además falló la restauración automática: ' +
          rollbackError.message + '. Usa el respaldo descargable para recuperar AIO.');
      }
    }
    throw error;
  }
}

async function handleOrganize(body) {
  const auth = await resolveStremioAuth(body);
  const current = await getAddonCollection(auth);
  const backup = await readBackup(String(body.preparedBackupId || ''));
  if (!accountOwnsBackup(auth, backup) ||
      backup.fingerprint !== collectionFingerprint(current)) {
    throw new Error('Crea un backup nuevo de la colección actual antes de organizar');
  }
  const order = body.order;
  if (!Array.isArray(order) || order.length !== current.length ||
      new Set(order).size !== current.length ||
      order.some(i => !Number.isInteger(i) || i < 0 || i >= current.length)) {
    throw new Error('El orden de addons no es válido');
  }
  const catalogChoices = body.catalogChoices || {};
  const edited = current.map((addon, index) => {
    const copy = deepClone(addon);
    if (Object.prototype.hasOwnProperty.call(catalogChoices, index)) {
      const original = copy.manifest?.catalogs;
      const selected = catalogChoices[index];
      if (!Array.isArray(selected) || (!Array.isArray(original) && selected.length)) {
        throw new Error('Selección de catálogos inválida');
      }
      if (!Array.isArray(original)) return copy;
      const keys = new Set(selected);
      const known = new Set(original.map(c => String(c.type) + ':' + String(c.id)));
      if ([...keys].some(key => !known.has(key))) throw new Error('Catálogo no reconocido');
      if (original.length && !keys.size) throw new Error('Deja al menos un catálogo por addon');
      copy.manifest.catalogs = original.filter(c => keys.has(String(c.type) + ':' + String(c.id)));
    }
    return copy;
  });
  const desired = order.map(index => edited[index]);
  try {
    await setAddonCollection(auth, desired);
    const actual = await getAddonCollection(auth);
    const signature = addons => addons.map(a => ({
      url: a.transportUrl,
      catalogs: (a.manifest?.catalogs || []).map(c => String(c.type) + ':' + String(c.id))
    }));
    if (JSON.stringify(signature(actual)) !== JSON.stringify(signature(desired))) {
      throw new Error('Stremio no confirmó el orden y los catálogos');
    }
    return { ok: true, count: actual.length, addons: addonSummary(actual) };
  } catch (error) {
    try { await setAddonCollection(auth, current); }
    catch (restoreError) { logError('Falló restauración tras organizar:', restoreError.message); }
    throw error;
  }
}

async function handleRestore(body) {
  const backupId = String(body.backupId || '').trim();
  if (!backupId) throw new Error('Falta el backup a restaurar');
  const auth = await resolveStremioAuth(body);
  const backup = await readBackup(backupId);
  if (!accountOwnsBackup(auth, backup)) throw new Error('Ese backup pertenece a otra cuenta');
  await setAddonCollection(auth, backup.addons);
  return { ok: true, restored: backup.addons.length, createdAt: backup.createdAt,
    aioConfig: backup.aioSnapshot?.config || null,
    aioHost: backup.aioSnapshot?.host || null };
}

async function handleRestoreJson(body) {
  const auth = await resolveStremioAuth(body);
  const addons = body?.addons;
  if (!Array.isArray(addons) || addons.length === 0) {
    throw new Error('El JSON no contiene una colección válida de addons');
  }
  for (const addon of addons) {
    if (!addon || typeof addon !== 'object' || !addon.transportUrl || !addon.manifest) {
      throw new Error('El JSON contiene un addon inválido');
    }
  }
  const current = await getAddonCollection(auth);
  const safetyBackupId = await backupCollection(auth.identity, current);
  await setAddonCollection(auth, addons);
  return {
    ok: true,
    restored: addons.length,
    safetyBackupId
  };
}

let HEALTH_CACHE = null;
async function handleHealth() {
  if (HEALTH_CACHE && Date.now() - HEALTH_CACHE.at < 5 * 60 * 1000) return HEALTH_CACHE.value;
  const value = await computeHealth();
  HEALTH_CACHE = { at: Date.now(), value };
  return value;
}

async function computeHealth() {
  const [aioResult, tamResult, metaResult] = await Promise.allSettled([
    fetchJson(AIO_BASE + '/api/v1/status', {}, 12000),
    fetchJson(TAMTARO_URL, {}, 12000),
    fetchJson(AIOMETA_BASE + '/api/config', {}, 12000)
  ]);
  const aio = aioResult.status === 'fulfilled' ? aioResult.value?.data : null;
  let tamtaro = null;
  if (tamResult.status === 'fulfilled') {
    const template = tamResult.value.find(x => x?.metadata?.id === 'tamtaro.complete');
    tamtaro = template?.metadata?.version || null;
  }
  return {
    wizard: WIZARD_VERSION,
    aio: aio ? {
      online: true,
      version: aio.version,
      channel: aio.channel,
      tag: aio.tag,
      buildTime: aio.buildTime
    } : { online: false },
    tamtaro,
    metadata: metaResult.status === 'fulfilled' ? {
      tmdb: metaResult.value.hasBuiltInTmdb === true,
      tvdb: metaResult.value.hasBuiltInTvdb === true
    } : { tmdb: false, tvdb: false }
  };
}

const ROUTES = {
  'POST /api/validate-key': handleValidateKey,
  'POST /api/connect': handleConnect,
  'POST /api/analyze': handleAnalyze,
  'POST /api/backup': handleBackup,
  'POST /api/configure': handleConfigure,
  'POST /api/transfer-check': handleTransferCheck,
  'POST /api/transfer-preview': handleTransferPreview,
  'POST /api/transfer-apply': handleTransferApply,
  'POST /api/aio-push': handleAioPush,
  'POST /api/organize': handleOrganize,
  'POST /api/restore': handleRestore,
  'POST /api/restore-json': handleRestoreJson,
  'POST /api/validate-addon': async body => {
    const addon = await customAddonFromUrl(body.url);
    return { ok: true, name: addon.manifest.name, id: addon.manifest.id, resources: addon.manifest.resources || [] };
  }
};

// Devuelve { status, body } o null si la ruta no es de la API.
async function handleApi(method, pathname, body) {
  if (method === 'GET' && pathname === '/api/health') return { status: 200, body: await handleHealth() };
  const handler = ROUTES[method + ' ' + pathname];
  if (!handler) return pathname.startsWith('/api/') ? { status: 404, body: { error: 'No encontrado' } } : null;
  try {
    return { status: 200, body: await handler(body || {}) };
  } catch (error) {
    // No registrar URLs completas: pueden llevar claves Debrid o tokens.
    const safe = String(error?.message || error).replace(/https?:\/\/([^\/\s'"]+)[^\s'"]*/g, 'https://$1/…');
    logError(new Date().toISOString(), method, pathname, safe);
    return { status: 400, body: { error: error?.message || 'Error inesperado' } };
  }
}

module.exports = { configure, handleApi, WIZARD_VERSION, buildAioConfig, buildStandaloneAddons, normalizeOptions,
  languageProfile, backupCollection, readBackup, parseAioManifest, handleAioPush, createOrUpdateAio,
  handleTransferPreview, handleTransferApply, transferDesired };
