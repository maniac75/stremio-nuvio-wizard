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
const AIOMETA_BASE = 'https://aiometadata.elfhosted.com';
const STREMIO_API = 'https://api.strem.io/api';
const WIZARD_VERSION = '0.20.1';
const NUVIO_API = 'https://api.nuvio.tv';
// Clave pública de aplicación de Nuvio; el usuario conserva sus credenciales.
const NUVIO_PUBLIC_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';

// Idiomas del contenido. Coinciden con los del preset del Bootstrapper (complementos y traducciones).
const CONTENT_LANGUAGES = ['es-MX', 'es-ES', 'en', 'pt-BR', 'pt-PT', 'fr', 'it', 'de', 'nl'];
// Idiomas de audio y subtítulos que acepta AIOStreams (nombres exactos de su lista).
const AIO_AUDIO_LANGUAGES = new Set([
  'English', 'Japanese', 'Chinese', 'Russian', 'Arabic', 'Portuguese', 'Portuguese (Brazil)', 'Spanish', 'Latino',
  'French', 'German', 'Italian', 'Korean', 'Hindi', 'Bengali', 'Punjabi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu',
  'Kannada', 'Malayalam', 'Thai', 'Vietnamese', 'Indonesian', 'Turkish', 'Hebrew', 'Persian', 'Ukrainian', 'Greek',
  'Lithuanian', 'Latvian', 'Estonian', 'Polish', 'Czech', 'Slovak', 'Hungarian', 'Romanian', 'Bulgarian', 'Serbian',
  'Croatian', 'Slovenian', 'Dutch', 'Danish', 'Finnish', 'Swedish', 'Norwegian', 'Malay'
]);
// Códigos de OpenSubtitles que usa la plantilla Tamtaro para cada idioma.
const SUBTITLE_CODES = {
  English: 'en', Spanish: 'es', Latino: 'ea', Portuguese: 'pt-pt', 'Portuguese (Brazil)': 'pt-br', French: 'fr',
  German: 'de', Italian: 'it', Dutch: 'nl', Japanese: 'ja', Korean: 'ko', Chinese: 'zh-cn', Russian: 'ru',
  Arabic: 'ar', Hindi: 'hi', Turkish: 'tr', Polish: 'pl', Swedish: 'sv', Norwegian: 'no', Danish: 'da',
  Finnish: 'fi', Greek: 'el', Hebrew: 'he', Czech: 'cs', Hungarian: 'hu', Romanian: 'ro', Ukrainian: 'uk',
  Vietnamese: 'vi', Thai: 'th', Indonesian: 'id', Malay: 'ms', Persian: 'fa', Bulgarian: 'bg', Croatian: 'hr',
  Serbian: 'sr', Slovak: 'sk', Slovenian: 'sl', Bengali: 'bn', Tamil: 'ta', Telugu: 'te', Malayalam: 'ml',
  Kannada: 'kn', Marathi: 'mr', Lithuanian: 'lt', Latvian: 'lv', Estonian: 'et'
};
// Watchly: recomendaciones según lo que ves (instancia pública de ElfHosted, código abierto).
const WATCHLY_BASE = 'https://watchly.elfhosted.com';
// PostersPlus: pósteres con notas y premios, instancia pública y gratuita de ElfHosted (sólo estilos predefinidos).
const POSTERSPLUS_BASE = 'https://postersplus.elfhosted.com';
const POSTERSPLUS_STYLES = new Set(['bar_sash', 'bar_notch', 'ratingbar_sash', 'ratingbar_notch', 'clean_sash',
  'clean_notch', 'tinted_mini_sash', 'tinted_mini_notch', 'mini_sash_oa', 'bar_notch_oa']);
const WATCHLY_LOCALES = {
  'es-MX': 'es-MX', 'es-ES': 'es-ES', en: 'en-US', 'pt-BR': 'pt-BR', 'pt-PT': 'pt-PT',
  fr: 'fr-FR', it: 'it-IT', de: 'de-DE', nl: 'nl-NL'
};

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
  if (host === 'localhost' || /\.(local|lan|home|internal|localhost)$/.test(host)) {
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
      const detail = body?.detail || body?.error?.message || body?.message || body?.msg || body?.error_description || body?.error || ('HTTP ' + response.status);
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
  let data;
  try {
    data = await stremioPost('login', { authKey: null, email, password });
  } catch (error) {
    if (/rate limit|HTTP 429|too many/i.test(String(error?.message || error))) {
      throw new Error('Stremio está limitando los intentos de inicio de sesión. Espera unos minutos y vuelve a intentar.');
    }
    throw error;
  }
  const authKey = data?.result?.authKey || data?.authKey;
  if (!authKey) {
    const detail = String(data?.error?.message || data?.error || '');
    if (/password|user not found|invalid|wrong|credential/i.test(detail)) {
      throw new Error('Correo o contraseña de Stremio incorrectos. Revisa que sean los de tu cuenta Stremio (no los de Nuvio ni TorBox).');
    }
    if (/rate limit/i.test(detail)) throw new Error('Stremio está limitando los intentos de inicio de sesión. Espera unos minutos y vuelve a intentar.');
    throw new Error('No se pudo iniciar sesión en Stremio');
  }
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
    let login;
    try {
      login = await nuvioRequest('/auth/v1/token?grant_type=password', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
    } catch (error) {
      const m = String(error?.message || error);
      if (/HTTP 400|invalid.*(credential|grant)|invalid login/i.test(m)) {
        throw new Error('Correo o contraseña de Nuvio incorrectos. Revisa que sean los de tu cuenta Nuvio (no los de Stremio ni TorBox).');
      }
      if (/email not confirmed/i.test(m)) throw new Error('Tu correo de Nuvio aún no está confirmado. Revisa tu bandeja de entrada y confirma la cuenta.');
      if (/HTTP 429|rate limit/i.test(m)) throw new Error('Nuvio está limitando los intentos de inicio de sesión. Espera unos minutos y vuelve a intentar.');
      throw error;
    }
    const authKey = String(login?.access_token || '');
    if (!authKey) throw new Error('Nuvio no devolvió una sesión válida');
    let profiles = await nuvioRequest('/rest/v1/rpc/sync_pull_profiles', {
      method: 'POST', headers: { Authorization: 'Bearer ' + authKey }, body: '{}'
    });
    profiles = Array.isArray(profiles) ? profiles.filter(p => Number.isFinite(Number(p?.profile_index))) : [];
    // Cuentas nuevas aún no sincronizan perfiles: Nuvio usa el perfil 1 por defecto (igual que el Bootstrapper).
    if (!profiles.length) profiles = [{ profile_index: 1, name: 'Principal' }];
    const requested = Number(body.profileId || profiles[0].profile_index);
    const profile = profiles.find(item => Number(item.profile_index) === requested);
    if (!profile) throw new Error('Selecciona un perfil existente de Nuvio');
    const payload = JSON.parse(Buffer.from(authKey.split('.')[1], 'base64url').toString('utf8'));
    if (!payload.sub) throw new Error('Nuvio no devolvió una cuenta válida');
    const profileName = String(profile.name || profile.profile_name || '');
    return { platform: 'nuvio', authKey, profileId: requested, profiles,
      identity: 'nuvio:user:' + payload.sub + ':profile:' + requested,
      // Sólo para Watchly (opcional); nunca se devuelve al navegador.
      nuvioSession: { refreshToken: String(login.refresh_token || ''), expiresAt: Number(login.expires_at || 0), profileName },
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
    // Cada manifiesto es una subsolicitud; el plan gratuito permite 50 por invocación.
    // Se leen como máximo 24; el resto usa el nombre guardado en Nuvio.
    const MAX_MANIFESTS = 24;
    return Promise.all(rows.map(async (row, index) => {
      const url = String(row.transportUrl || row.url || '');
      let manifest, manifestFailed = false, manifestSkipped = false;
      if (index < MAX_MANIFESTS) {
        try { manifest = await fetchJson(url, {}, 9000); }
        catch { manifestFailed = true; }
      } else manifestSkipped = true;
      if (!manifest) manifest = { id: 'nuvio.existing.' + hashText(url || index), name: row.name || 'Complemento Nuvio', catalogs: [] };
      return { transportUrl: url, transportName: 'http', manifest, _nuvio: true, _manifestFailed: manifestFailed,
        _manifestSkipped: manifestSkipped, enabled: row.enabled !== false, sort_order: row.sort_order ?? index };
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
    throw new Error('Stremio no devolvió una colección válida de complementos');
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

// ---- Colecciones de inicio de Nuvio (filas y carpetas de la pantalla principal) ----
const BOOTSTRAPPER_LOCALE_URL = 'https://raw.githubusercontent.com/DryKillLogic/stremio-account-bootstrapper/main/src/locales/';
// Traducciones disponibles en el Bootstrapper (src/locales): es, pt, fr, it, de, nl y en.
function bootstrapperLocale(language) {
  const base = String(language || 'en').split('-')[0];
  return ['es', 'pt', 'fr', 'it', 'de', 'nl'].includes(base) ? base : 'en';
}

async function nuvioRpc(auth, fn, body) {
  return nuvioRequest('/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { Authorization: 'Bearer ' + auth.authKey }, body: JSON.stringify(body || {})
  });
}

// Devuelve las colecciones actuales del perfil (o null si no se pudieron leer).
async function pullNuvioCollections(auth) {
  try {
    const data = await nuvioRpc(auth, 'sync_pull_collections', { p_profile_id: auth.profileId });
    return normalizeNuvioCollections(data);
  } catch (error) {
    logError('No se pudieron leer las colecciones de Nuvio:', error);
    return null;
  }
}

function normalizeNuvioCollections(data) {
  let value = data;
  if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === 'object' && !Array.isArray(value[0]) &&
      ('collections_json' in value[0] || 'p_collections_json' in value[0])) value = value[0];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    value = value.collections_json ?? value.p_collections_json ?? value.collections ?? value;
  }
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  return Array.isArray(value) ? value : null;
}

async function pushNuvioCollections(auth, collections) {
  const data = await nuvioRpc(auth, 'sync_push_collections', { p_profile_id: auth.profileId, p_collections_json: collections });
  if (data?.success === false || data?.result?.success === false) throw new Error('Nuvio rechazó las colecciones');
  return data;
}

function collectionKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Traduce títulos con los textos del Bootstrapper (misma lógica que su translateCollections).
function translateNuvioCollections(collections, messages) {
  const suffix = messages.nuvio_collection_suffix || 'Collection';
  return collections.map(collection => {
    const slug = collectionKey(collection.title);
    const out = deepClone(collection);
    if (messages['nuvio_collection_' + slug]) out.title = messages['nuvio_collection_' + slug];
    out.folders = (out.folders || []).map(folder => {
      const title = messages['nuvio_collection_' + slug + '_' + collectionKey(folder.title)];
      if (!title) return folder;
      return { ...folder, title, sources: (folder.sources || []).map(src => ({ ...src, title: title + ' ' + suffix })) };
    });
    return out;
  });
}

async function buildNuvioCollections(options, preset) {
  if (options.kids) return [];
  const data = preset || await fetchJson(PRESET_URL, {}, 20000);
  let list = deepClone(data.nuvioCollectionsConfig || []);
  if (options.tmdbMode === 'personal' && options.tmdbKey && data.nuvioFranchisesCollectionConfig) {
    list.push(deepClone(data.nuvioFranchisesCollectionConfig));
  }
  let messages = {};
  try { messages = await fetchJson(BOOTSTRAPPER_LOCALE_URL + bootstrapperLocale(options.language) + '.json', {}, 12000) || {}; } catch {}
  return translateNuvioCollections(list, messages);
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

// Huella de la colección: sólo URLs, estado y orden. No incluye el contenido de los manifiestos,
// que Stremio puede refrescar entre dos lecturas y provocaba falsos «la colección cambió».
function collectionFingerprint(addons) {
  const list = Array.isArray(addons) ? addons : [];
  const content = list.map((addon, index) => ({
    url: normalizeManifestUrl(addon?.transportUrl),
    enabled: addon?._nuvio ? addon.enabled !== false : !(addon?.flags?.disabled),
    order: addon?._nuvio ? (addon.sort_order ?? index) : index
  }));
  return 'v2:' + crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function legacyFingerprint(addons) {
  const list = Array.isArray(addons) ? addons : [];
  const content = list.length && list.every(addon => addon._nuvio)
    ? list.map(addon => ({ url: addon.transportUrl, enabled: addon.enabled, order: addon.sort_order }))
    : list;
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

// Acepta huellas nuevas y las de respaldos creados antes del cambio.
function fingerprintMatches(stored, addons) {
  if (!stored) return false;
  return stored === collectionFingerprint(addons) || stored === legacyFingerprint(addons);
}

async function backupCollection(identity, addons, aioSnapshot, extra) {
  const createdAt = new Date().toISOString();
  return await encryptBackup({
    ...(extra || {}),
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

function subtitleCodesFor(names) {
  const codes = [];
  for (const name of names) {
    const code = SUBTITLE_CODES[name];
    if (code && !codes.includes(code)) codes.push(code);
    if (name === 'Spanish' && !codes.includes('sp')) codes.push('sp');
  }
  return codes.length ? codes : ['en'];
}

// Perfil de idioma para AIOStreams. options.audioLanguages / subtitleLanguages (avanzado) reemplazan
// el orden por defecto del idioma principal.
function languageProfile(language, options) {
  const map = {
    'es-MX': { required: ['Latino', 'Spanish'], subtitles: ['Latino', 'Spanish', 'English'] },
    'es-ES': { required: ['Spanish'], subtitles: ['Spanish', 'English'] },
    'en': { required: ['English'], subtitles: ['English'] },
    'pt-BR': { required: ['Portuguese (Brazil)', 'Portuguese'], subtitles: ['Portuguese (Brazil)', 'Portuguese', 'English'] },
    'pt-PT': { required: ['Portuguese', 'Portuguese (Brazil)'], subtitles: ['Portuguese', 'Portuguese (Brazil)', 'English'] },
    'fr': { required: ['French'], subtitles: ['French', 'English'] },
    'it': { required: ['Italian'], subtitles: ['Italian', 'English'] },
    'de': { required: ['German'], subtitles: ['German', 'English'] },
    'nl': { required: ['Dutch'], subtitles: ['Dutch', 'English'] }
  };
  const base = map[language] || map['es-MX'];
  const audio = options?.audioLanguages?.length ? options.audioLanguages : base.required;
  const subtitles = options?.subtitleLanguages?.length ? options.subtitleLanguages : base.subtitles;
  const codes = subtitleCodesFor(subtitles);
  // es-MX conserva su lista probada de códigos (incluye «sp»).
  return {
    required: [...audio],
    subtitles: [...subtitles],
    primary: audio[0],
    subtitleCodes: language === 'es-MX' && !options?.subtitleLanguages?.length ? ['ea', 'es', 'sp', 'en'] : codes
  };
}

function buildTamtaroInputs(template, options) {
  const inputs = defaultsFromInputs(template?.metadata?.inputs || []);
  const lang = languageProfile(options.language, options);
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
    throw new Error('El perfil AIOStreams base no es válido');
  }
  const generated = config;
  config = deepMerge(generated, baseline);
  // El perfil base se armó para cuentas con Debrid (SeaDex, biblioteca, Torznab…). Sin Debrid, AIOStreams
  // rechaza esos presets, así que se usan los que la plantilla genera para fuentes gratuitas.
  if (!hasDebrid && Array.isArray(generated.presets)) config.presets = deepClone(generated.presets);
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
  if (options.language !== 'es-MX' || options.audioLanguages?.length || options.subtitleLanguages?.length) {
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
    if (!configured) throw new Error('La plantilla AIOStreams no incluyó Debridio; no se aplicaron cambios.');
  }

  // Los subtítulos de OpenSubtitles V3+ dentro de AIOStreams siguen el idioma elegido
  // (el perfil base trae los de español latino).
  const subtitleCodes = languageProfile(options.language, options).subtitleCodes;
  for (const preset of config.presets || []) {
    if (preset?.type === 'opensubtitles-v3-plus' && preset.options) preset.options.language = [...subtitleCodes];
  }

  // Portugués de Brasil: Brazuca Torrents suma fuentes locales (igual que el Bootstrapper).
  if (options.language === 'pt-BR') {
    config.presets = config.presets || [];
    if (!config.presets.some(p => p?.type === 'brazuca-torrents')) {
      config.presets.push({ type: 'brazuca-torrents', instanceId: 'b7a', enabled: true,
        options: { name: 'Brazuca Torrents', timeout: 5000, resources: ['stream'] } });
    }
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

// Traduce los rechazos de AIOStreams más comunes a un mensaje que el usuario pueda resolver.
function friendlyAioError(error) {
  const m = String(error?.message || error || '');
  if (/TMDB/i.test(m) && /(401|unauthori[sz]ed|invalid|validate)/i.test(m)) {
    return 'AIOStreams rechazó tu clave de TMDB. Revísala en el paso 4 o elige la clave integrada.';
  }
  if (/TVDB/i.test(m) && /(401|unauthori[sz]ed|invalid|validate)/i.test(m)) {
    return 'AIOStreams rechazó tu clave de TVDB. Revísala en el paso 4 o elige la clave integrada.';
  }
  if (/debridio/i.test(m)) return 'Falta la clave de Debridio o no es válida. Revisa el campo Debridio en el paso 3, o déjalo vacío.';
  if (/requires at least one usable service/i.test(m)) {
    return 'AIOStreams pidió un servicio Debrid para una de las fuentes. Vuelve a intentarlo; si se repite, avísanos en GitHub.';
  }
  if (/(torbox|real.?debrid|alldebrid|premiumize|debrid.?link|offcloud|easydebrid).*(invalid|unauthori|401|403)/i.test(m)) {
    return 'AIOStreams no aceptó tu clave de Debrid. Revísala en el paso 3.';
  }
  return 'El servidor de AIOStreams rechazó la configuración: ' + m;
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
    throw new Error('No se puede conservar AIOStreams: su instancia no permite una actualización verificada. Elige instalar uno nuevo.');
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
      if (!previousConfig) throw new Error('No pude respaldar la configuración AIOStreams actual');

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
        throw new Error(friendlyAioError(error));
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
      catch (rollbackError) { logError('Falló rollback AIOStreams:', rollbackError.message); }
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
  const known = new Set(['tmdb', 'tvdb', 'rpdb', 'mdblist', 'debridio', 'torbox', 'realdebrid', 'premiumize', 'alldebrid', 'debridlink', 'easydebrid']);
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
    } else if (service === 'mdblist') {
      url = 'https://api.mdblist.com/user?apikey=' + encodeURIComponent(key);
    } else if (service === 'debridio') {
      // Debridio no publica un endpoint de verificación: su manifiesto responde 403
      // («Subscription is inactive») si la clave no existe o la suscripción venció.
      const config = Buffer.from(JSON.stringify({ api_key: key, provider: 'torbox', providerKey: '' })).toString('base64');
      url = 'https://addon.debridio.com/' + config + '/manifest.json';
    } else if (service === 'torbox') {
      url = 'https://api.torbox.app/v1/api/user/me';
      options.headers = { Authorization: 'Bearer ' + key };
    } else {
      url = 'https://api.real-debrid.com/rest/1.0/user';
      options.headers = { Authorization: 'Bearer ' + key };
    }
    const response = await fetch(url, options);
    if (service === 'debridio' && response.status === 403) {
      return { status: 'invalid', message: 'Debridio rechazó la clave o la suscripción no está activa.' };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: 'invalid', message: 'La clave fue rechazada por ' + (service === 'mdblist' ? 'MDBList' : service.toUpperCase()) + '.' };
    }
    if (response.status === 429 || response.status >= 500) return { status: 'unknown', message: 'El servicio no pudo responder ahora. Prueba de nuevo más tarde.' };
    if (!response.ok) return unknown;
    const result = await response.json();
    if (service === 'tvdb' && !result?.data?.token) return { status: 'invalid', message: 'TVDB no aceptó esta API key.' };
    if (service === 'torbox' && result?.success === false) return { status: 'invalid', message: 'TorBox no aceptó esta API key.' };
    if (service === 'debridio') {
      return result?.id ? { status: 'valid', message: 'Clave y suscripción de Debridio activas.' } : unknown;
    }
    return { status: 'valid', message: 'Clave verificada con ' + (service === 'mdblist' ? 'MDBList' : service.toUpperCase()) + '.' };
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

  const catalogLocale = bootstrapperLocale(options.language);
  if (catalogLocale !== 'en' && Array.isArray(config.catalogs)) {
    try {
      const locale = await fetchJson(BOOTSTRAPPER_LOCALE_URL + catalogLocale + '.json', {}, 12000);
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
  // MDBList (opcional): búsqueda MDBList y registro de lo visto en la cuenta del usuario.
  config.apiKeys.mdblist = options.mdblistKey || '';
  const ratingPosters = options.rpdbMode === 'personal' || options.rpdbMode === 'postersplus';
  if (options.rpdbMode === 'personal') {
    config.posterRatingProvider = 'rpdb';
    delete config.customPosterUrlPattern;
  } else if (options.rpdbMode === 'postersplus') {
    // Por ID de IMDb; un título sin IMDb conserva su póster normal.
    config.posterRatingProvider = 'custom';
    config.customPosterUrlPattern = POSTERSPLUS_BASE + '/p/' + options.postersPlusStyle + '/{type}/{imdb_id}.jpg';
  } else {
    config.posterRatingProvider = 'none';
    delete config.customPosterUrlPattern;
  }
  config.enableRatingPostersForLibrary = ratingPosters;
  if (Array.isArray(config.catalogs) && !ratingPosters) {
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
  if (!merged.transportUrl) throw new Error('Complemento sin URL: ' + key);
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
    throw new Error('URL de complemento inválida: ' + value);
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
    try {
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
    } catch (error) {
      skipped.push('torrentio' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'torrentio', error);
    }
  }

  if (selected.has('comet')) {
    try {
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
    } catch (error) {
      skipped.push('comet' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'comet', error);
    }
  }

  if (selected.has('meteor')) {
    try {
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
    } catch (error) {
      skipped.push('meteor' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'meteor', error);
    }
  }

  if (selected.has('webstreamr')) {
    try {
      out.push(await optional(presetAddon(preset, 'webstreamrmbg', options.language)));
    } catch (error) {
      skipped.push('webstreamr' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'webstreamr', error);
    }
  }

  if (selected.has('sootiohttp')) {
    try {
      out.push(await optional(presetAddon(preset, 'sootiohttp', options.language)));
    } catch (error) {
      skipped.push('sootiohttp' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'sootiohttp', error);
    }
  }

  if (selected.has('hdhub')) {
    try {
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
    } catch (error) {
      skipped.push('hdhub' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'hdhub', error);
    }
  }

  if (selected.has('jackettio')) {
    try {
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
    } catch (error) {
      skipped.push('jackettio' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'jackettio', error);
    }
  }

  if (selected.has('torrentsdb')) {
    try {
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
    } catch (error) {
      skipped.push('torrentsdb' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'torrentsdb', error);
    }
  }

  if (selected.has('stremthru')) {
    try {
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
    } catch (error) {
      skipped.push('stremthru' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'stremthru', error);
    }
  }

  if (selected.has('mediafusion')) {
    try {
      const base = deepMerge(
        preset.languages?.en?.mediafusion || {},
        preset.languages?.[options.language]?.mediafusion || {}
      );
      const config = deepClone(preset.mediafusionConfig || {});
      const langName = ({ 'es-MX': 'Latino', 'es-ES': 'Spanish', 'pt-BR': 'Portuguese', 'pt-PT': 'Portuguese',
        fr: 'French', it: 'Italian', de: 'German', nl: 'Dutch' })[options.language] || 'English';

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
    } catch (error) {
      skipped.push('mediafusion' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'mediafusion', error);
    }
  }

  if (selected.has('cometa')) {
    try {
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
    } catch (error) {
      skipped.push('cometa' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'cometa', error);
    }
  }

  if (selected.has('latinobrid')) {
    try {
      // Latinobrid (stremx): español latino con TorBox, Premiumize u Offcloud.
      const lbDebrid = options.debrids.find(d => ['torbox', 'premiumize', 'offcloud'].includes(d.service));
      if (lbDebrid) {
        const config = { service: lbDebrid.service, apiKey: lbDebrid.key, uncached: !options.cachedOnly, extraCatalogs: false };
        const url = 'https://latinobrid.stremx.net/' + Buffer.from(JSON.stringify(config)).toString('base64') + '/manifest.json';
        out.push(await optional({ transportUrl: url }, url));
      } else {
        skipped.push('Latinobrid (requiere TorBox o Premiumize)');
      }
    } catch (error) {
      skipped.push('latinobrid' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'latinobrid', error);
    }
  }

  if (selected.has('peerflix')) {
    try {
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
    } catch (error) {
      skipped.push('peerflix' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'peerflix', error);
    }
  }

  if (selected.has('stremify')) {
    try {
      const providers = Buffer.from('cinehdplus,verhdlink').toString('base64');
      const url = 'https://stremify.hayd.uk/' + providers + '/manifest.json';
      out.push(await optional({ transportUrl: url }, url));
    } catch (error) {
      skipped.push('stremify' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'stremify', error);
    }
  }

  if (selected.has('animes')) {
    try {
      const url = 'https://pigamer37.alwaysdata.net/onAirCatalogs=animeav1/manifest.json';
      out.push(await optional({ transportUrl: url }, url));
    } catch (error) {
      skipped.push('animes' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'animes', error);
    }
  }

  if (selected.has('linkanol')) {
    try {
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
    } catch (error) {
      skipped.push('linkanol' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'linkanol', error);
    }
  }

  if (selected.has('pelis')) {
    try {
      try {
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
      } catch (error) {
        skipped.push('PeLis');
        logError('PeLis omitido:', error);
      }
    } catch (error) {
      skipped.push('pelis' + ': ' + String(error?.message || error).slice(0, 120));
      logError('Complemento omitido:', 'pelis', error);
    }
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
      ? 'Se instalará otro AIOStreams en el servidor recomendado; el anterior no se modificará y su URL está en el respaldo.'
      : options.instanceMode === 'keep'
        ? 'Se actualiza el AIOStreams en su instancia actual.'
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
    ['latinobrid', id === 'community.latinobrid', 'Latinobrid'],
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

  if (isWatchlyAddon(addon)) {
    return options.watchly
      ? { action: 'replace', reason: 'Watchly se vuelve a conectar con tu cuenta y el idioma elegido.' }
      : { action: 'ask', reason: 'Complemento ajeno al wizard: tú decides si conservarlo.' };
  }
  if (id === 'com.stremio.watchhub' && options.removeWatchHub) {
    return { action: 'remove', reason: 'WatchHub está marcado para eliminar.' };
  }
  return { action: 'ask', reason: 'Complemento ajeno al wizard: tú decides si conservarlo.' };
}

// Crea (o actualiza) la cuenta de Watchly de este usuario y devuelve su complemento.
// Stremio: Watchly lee la biblioteca con la AuthKey. Nuvio: con la sesión de Nuvio del perfil elegido.
async function createWatchlyAddon(options, auth) {
  const payload = {
    language: WATCHLY_LOCALES[options.language] || 'en-US',
    popularity: 'balanced',
    sorting_order: 'default'
  };
  if (auth?.platform === 'nuvio') {
    if (!auth.nuvioSession?.refreshToken) throw new Error('Nuvio no entregó una sesión renovable para Watchly');
    Object.assign(payload, {
      watch_history_source: 'nuvio',
      nuvio_access_token: auth.authKey,
      nuvio_refresh_token: auth.nuvioSession.refreshToken,
      nuvio_expires_at: auth.nuvioSession.expiresAt || null,
      nuvio_profile_id: auth.profileId || 1,
      nuvio_profile_name: auth.nuvioSession.profileName || null
    });
  } else {
    if (!auth?.authKey) throw new Error('Falta la sesión de Stremio para Watchly');
    Object.assign(payload, { watch_history_source: 'stremio', authKey: auth.authKey });
  }
  const data = await fetchJson(WATCHLY_BASE + '/tokens/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 30000);
  const url = String(data?.manifestUrl || '');
  if (!/^https:\/\/[^/]+\/.+\/manifest\.json$/i.test(url)) throw new Error('Watchly no devolvió una URL de instalación');
  const manifest = await fetchJson(url, {}, 25000);
  if (!manifest?.id) throw new Error('El manifiesto de Watchly no es válido');
  return { transportUrl: url, transportName: 'http', manifest };
}

function isWatchlyAddon(addon) {
  const id = String(addon?.manifest?.id || '').toLowerCase();
  const url = String(addon?.transportUrl || '').toLowerCase();
  return id.includes('watchly') || /\/\/watchly[.-]/.test(url);
}

async function buildDesiredAddons(options, currentAddons, auth) {
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
  // Watchly es opcional: si su servidor falla, se instala todo lo demás y se avisa.
  let watchly = null, watchlyReused = false;
  const skipped = [...(standalone.skipped || [])];
  if (options.watchly) {
    try { watchly = await createWatchlyAddon(options, auth); }
    catch (error) {
      logError('Watchly omitido:', error);
      // Si ya tenía Watchly, se conserva el anterior en vez de perderlo.
      const old = currentAddons.find(isWatchlyAddon);
      if (old) { watchly = deepClone(old); watchlyReused = true; }
      else skipped.push('Watchly');
    }
  }
  const aio = await createOrUpdateAio(options, currentAddons);
  // Orden recomendado por las guías: las filas de Watchly antes que los catálogos de AIOMetadata.
  const desired = [
    ...(options.trailers ? [staticDesired[1]] : []),
    staticDesired[0],
    ...(watchly ? [watchly] : []),
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
  return { desired: platformAddons, aio, metadataReused, skippedAddons: skipped, watchlyInstalled: !!watchly && !watchlyReused, watchlyReused };
}

const FREE_STANDALONE_ADDONS = new Set([
  'comet','webstreamr','sootiohttp','torrentsdb','stremthru',
  'mediafusion','cometa','animes'
]);

// Lista ordenada de idiomas válidos (sin repetidos, máximo 8). Vacía = usar los del idioma principal.
function languageList(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(name => allowed.has(name)))].slice(0, 8);
}

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
    language: CONTENT_LANGUAGES.includes(body.language) ? body.language : 'es-MX',
    audioLanguages: languageList(body.audioLanguages, AIO_AUDIO_LANGUAGES),
    subtitleLanguages: languageList(body.subtitleLanguages, new Set(Object.keys(SUBTITLE_CODES))),
    watchly: body.watchly === true,
    profileMode: body.profileMode === 'tamtaro' ? 'tamtaro' : 'recommended',
    instanceMode: 'recommended',
    aioInstallMode: 'new',
    debrids,
    debridioKey: noDebrid ? '' : String(body.debridioKey || '').trim(),
    tmdbMode: body.tmdbMode === 'personal' ? 'personal' : (body.tmdbMode === 'instance' ? 'instance' : (body.tmdbKey ? 'personal' : 'instance')),
    tvdbMode: body.tvdbMode === 'personal' ? 'personal' : (body.tvdbMode === 'instance' ? 'instance' : (body.tvdbKey ? 'personal' : 'instance')),
    rpdbMode: body.rpdbMode === 'personal' ? 'personal' : (body.rpdbMode === 'postersplus' ? 'postersplus' :
      (body.rpdbMode === 'none' ? 'none' : (body.rpdbKey ? 'personal' : 'none'))),
    postersPlusStyle: POSTERSPLUS_STYLES.has(String(body.postersPlusStyle)) ? String(body.postersPlusStyle) : 'bar_sash',
    tmdbKey: body.tmdbMode === 'instance' ? '' : String(body.tmdbKey || '').trim(),
    tvdbKey: body.tvdbMode === 'instance' ? '' : String(body.tvdbKey || '').trim(),
    rpdbKey: body.rpdbMode === 'personal' || (!body.rpdbMode && body.rpdbKey) ? String(body.rpdbKey || '').trim() : '',
    mdblistKey: String(body.mdblistKey || '').trim().slice(0, 128),
    anime: body.anime === true,
    argentinaTv: false, // retirado: Argentina TV ya no se ofrece; si estaba instalado, se quita
    nuvioCollections: body.nuvioCollections !== false,
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
        !fingerprintMatches(prepared.fingerprint, addons)) {
      throw new Error('El respaldo ya no corresponde a esta cuenta o su colección cambió');
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
      throw new Error('Para actualizar el AIOStreams existente, adjunta su exportación JSON en el respaldo o elige instalar uno nuevo.');
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
        aioPreview.push = { available: false, reason: 'No pude leer la configuración del AIOStreams instalado' };
      }
    } else if (installedAio) {
      aioPreview.push = { available: false, reason: 'La URL de ese AIOStreams no permite un push verificado desde el wizard' };
    }
    if (options.aioInstallMode === 'new' && installedAio) {
      aioPreview.push = { available: false, reason: 'Elegiste una instalación nueva. Aplicar en ' + (options.platform === 'nuvio' ? 'Nuvio' : 'Stremio') + ' creará otro AIOStreams sin modificar el anterior' };
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
  if (options.watchly) addIfMissing(addons.some(isWatchlyAddon), 'Watchly', 'Recomendaciones personalizadas según lo que ves.');

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
    ['latinobrid','community.latinobrid','Latinobrid'],
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
        ['peerflix','cometa','stremify','animes','linkanol','pelis','latinobrid'].includes(key)
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
      throw new Error('La exportación AIOStreams no tiene una configuración válida');
    }
    snapshot = { host, config, source: 'imported' };
  }
  const parsed = parseAioManifest(aio.transportUrl);
  if (!parsed) return { needed: true, snapshot, host, manageable: false,
    reason: 'La URL instalada no permite administrar AIOStreams desde el wizard' };
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
        ? 'Midnight exige la contraseña original de AIOStreams y rechaza el token de la URL'
        : password ? 'La contraseña de AIOStreams no fue aceptada o la instancia no respondió'
          : 'No se pudo autenticar con el token de la URL instalada' };
  }
}

async function handleBackup(body) {
  const auth = await resolveStremioAuth(body);
  const current = await getAddonCollection(auth);
  const aio = await readAioSnapshot(current, body.aioConfig);
  const nuvioCollections = auth.platform === 'nuvio' ? await pullNuvioCollections(auth) : null;
  const backupId = await backupCollection(auth.identity, current, aio.snapshot,
    auth.platform === 'nuvio' ? { nuvioCollections } : null);
  const verified = await readBackup(backupId);
  const fingerprint = collectionFingerprint(current);

  if (
    verified.accountHash !== hashText(auth.identity) ||
    verified.fingerprint !== fingerprint ||
    !Array.isArray(verified.addons) ||
    verified.addons.length !== current.length
  ) {
    throw new Error('El respaldo se creó pero no pasó la verificación de integridad');
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
  if (!preparedBackupId) throw new Error('Primero crea y verifica el respaldo seguro');

  const auth = await resolveStremioAuth(options);
  const current = await getAddonCollection(auth);
  const preparedBackup = await readBackup(preparedBackupId);

  if (!accountOwnsBackup(auth, preparedBackup)) {
    throw new Error('Ese respaldo pertenece a otra cuenta de Stremio');
  }
  if (!preparedBackup.fingerprint) {
    throw new Error('Ese respaldo es antiguo. Crea un respaldo seguro nuevo antes de configurar');
  }
  if (!fingerprintMatches(preparedBackup.fingerprint, current)) {
    throw new Error('La cuenta cambió después del respaldo. Vuelve a crear el respaldo antes de configurar');
  }

  if (options.aioInstallMode === 'update' && findAioAddon(current) &&
      !preparedBackup.aioSnapshot) {
    throw new Error('Para actualizar el AIOStreams existente, respalda primero sus ajustes o elige una instalación nueva.');
  }

  const backupId = preparedBackupId;
  let built;
  try { built = await buildDesiredAddons(options, current, auth); }
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
    let collections = null;
    if (auth.platform === 'nuvio' && options.nuvioCollections) {
      try {
        const list = await buildNuvioCollections(options);
        if (list.length) { await pushNuvioCollections(auth, list); collections = { applied: true, count: list.length }; }
      } catch (error) {
        logError('Colecciones Nuvio:', error);
        collections = { applied: false, error: String(error?.message || error).slice(0, 160) };
      }
    }
    const [aioStatus, metadataStatus] = await Promise.allSettled([
      fetchJson(new URL(built.aio.addon.transportUrl).origin + '/api/v1/status', {}, 10000),
      fetchJson(AIOMETA_BASE + '/api/config', {}, 10000)
    ]);

    return {
      ok: true,
      collections,
      platform: auth.platform || 'stremio',
      profileId: auth.profileId || null,
      profiles: auth.platform === 'nuvio' ? (auth.profiles || []).map(p => ({ id: Number(p.profile_index), name: p.name || p.profile_name || ('Perfil ' + p.profile_index) })) : [],
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
      watchly: options.watchly ? { installed: built.watchlyInstalled, reused: built.watchlyReused } : null,
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
      logError('Falló rollback AIOStreams:', rollbackError.message);
    }
    const restoration = restoreFailed ? ' No se pudo confirmar la restauración automática; comprueba el perfil antes de reintentar.' : '';
    const aioNotice = aioRollbackFailed ? ' La limpieza del AIOStreams nuevo tampoco se confirmó.' : '';
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

// Complementos que sólo existen en el destino (no vienen del origen ni son los integrados que se omiten).
function transferTargetOnly(source, targetCurrent) {
  const sourceKeys = new Set(source.map(nuvioUrlKey));
  const sourceIds = new Set(source.map(a => String(a?.manifest?.id || '').toLowerCase()).filter(Boolean));
  const skip = new Set(['com.linvo.cinemeta', 'org.streailer.trailer']);
  return targetCurrent.filter(addon => {
    const id = String(addon?.manifest?.id || '').toLowerCase();
    return !skip.has(id) && !sourceKeys.has(nuvioUrlKey(addon)) && !(id && sourceIds.has(id));
  });
}

function transferDesired(source, targetCurrent, targetPlatform, keepTargetUrls) {
  const sourceAddons = source.map(addon => {
    const { _nuvio, sort_order, ...clean } = addon;
    return clean;
  });
  const keep = new Set((Array.isArray(keepTargetUrls) ? keepTargetUrls : []).map(u => nuvioUrlKey({ transportUrl: String(u) })));
  const kept = transferTargetOnly(source, targetCurrent).filter(addon => keep.has(nuvioUrlKey(addon)))
    .map(addon => { const { _nuvio, sort_order, ...clean } = addon; return clean; });
  if (targetPlatform === 'nuvio') {
    return uniqueNuvioAddons([...sourceAddons.filter(addon =>
      !['com.linvo.cinemeta', 'org.streailer.trailer'].includes(addon?.manifest?.id)), ...kept]);
  }
  // Stremio retains its own built-in metadata and trailer addons when Nuvio is the source.
  const builtins = targetCurrent.filter(addon =>
    ['com.linvo.cinemeta', 'org.streailer.trailer'].includes(addon?.manifest?.id));
  const seen = new Set();
  return [...builtins, ...sourceAddons, ...kept].filter(addon => {
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
  if (!body.sourceFingerprint || !fingerprintMatches(body.sourceFingerprint, source)) {
    throw new Error('La lista de origen cambió desde la instalación. Revísala antes de copiar.');
  }
  if (sourcePlatform === 'nuvio' && targetPlatform === 'stremio' &&
      source.some(addon => String(addon?.manifest?.id || '').startsWith('nuvio.existing.'))) {
    throw new Error('Nuvio contiene complementos cuyo manifiesto no responde. No se copiaran datos incompletos a Stremio.');
  }
  const targetAuth = await resolveStremioAuth(body.target);
  const targetCurrent = await getAddonCollection(targetAuth);
  const desired = transferDesired(source, targetCurrent, targetPlatform, body.keepTargetUrls);
  if (!findAioAddon(desired)) throw new Error('El origen no contiene AIOStreams; no se copiará una lista incompleta.');
  return { source, targetAuth, targetCurrent, desired, targetPlatform,
    targetOnly: transferTargetOnly(source, targetCurrent) };
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
  const targetCollections = targetPlatform === 'nuvio' ? await pullNuvioCollections(targetAuth) : null;
  const backupId = await backupCollection(targetAuth.identity, targetCurrent, null,
    targetPlatform === 'nuvio' ? { nuvioCollections: targetCollections } : null);
  const backup = await readBackup(backupId);
  if (!accountOwnsBackup(targetAuth, backup) ||
      !fingerprintMatches(backup.fingerprint, targetCurrent) ||
      backup.addons.length !== targetCurrent.length) {
    throw new Error('No se pudo verificar el respaldo de la segunda cuenta');
  }
  recordTransferActivity({event: 'transfer_preview', target: targetPlatform, account: backup.accountHash.slice(0, 12),
    previous: targetCurrent.length, proposed: desired.length});
  return {
    ok: true, backupId, backupLabel: backupLabel(backup), platform: targetPlatform,
    previous: addonSummary(targetCurrent),
    desired: addonSummary(desired),
    targetOnly: addonSummary(context.targetOnly),
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
      !fingerprintMatches(backup.fingerprint, targetCurrent)) {
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
    let collections = null;
    if (targetPlatform === 'nuvio' && body.includeCollections === true) {
      try {
        const tmdbKey = String(body.tmdbKey || '').trim().slice(0, 512);
        const list = await buildNuvioCollections({ language: body.language || 'es-MX', kids: false,
          tmdbMode: tmdbKey && body.includeFranchises !== false ? 'personal' : 'instance', tmdbKey });
        if (list.length) { await pushNuvioCollections(targetAuth, list); collections = { applied: true, count: list.length }; }
      } catch (error) {
        logError('Colecciones Nuvio en copia:', error);
        collections = { applied: false };
      }
    }
    return { ok: true, backupId, backupLabel: backupLabel(backup), platform: targetPlatform,
      total: installed.length, addons: addonSummary(installed), collections,
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
  if (options.aioInstallMode === 'new') throw new Error('La actualización directa de AIOStreams no está disponible; el wizard instala uno nuevo.');
  await validateMetadataOptions(options);
  if (!options.debrids.length) throw new Error('Ingresa las claves Debrid antes de actualizar AIOStreams');
  const auth = await resolveStremioAuth(options);
  const current = await getAddonCollection(auth);
  const prepared = await readBackup(String(body.preparedBackupId || ''));
  if (!accountOwnsBackup(auth, prepared) ||
      !fingerprintMatches(prepared.fingerprint, current)) {
    throw new Error('Crea un respaldo de la colección actual antes de actualizar AIOStreams');
  }
  const addon = findAioAddon(current);
  const target = addon && parseAioManifest(addon.transportUrl);
  if (!target) throw new Error('No hay un AIOStreams instalado en una instancia compatible para actualizar');
  if (options.instanceMode !== 'keep' && target.base !== AIO_BASE) {
    throw new Error('Elegiste cambiar de instancia: usa Configurar Stremio o elige mantener la actual');
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: basicAuth(target.uuid, options.aioPassword || target.token)
  };
  const previous = (await fetchJson(target.base + '/api/v1/user?raw=true',
    { headers }, 30000))?.data?.userData;
  if (!previous) throw new Error('No se pudo leer el AIOStreams instalado');
  if (hashText(JSON.stringify(previous)) !== body.expectedHash) {
    throw new Error('AIOStreams cambió después de la revisión. Revisa nuevamente antes de actualizar');
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
    throw new Error('No pude verificar la copia de AIOStreams antes de actualizar');
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
      throw new Error('AIOStreams no confirmó la configuración enviada');
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

// Ordena complementos y, en Stremio, oculta o renombra catálogos.
// Antes de configurar: exige el respaldo preparado. Después de instalar: exige la huella que devolvió
// la instalación (la cuenta no cambió desde entonces) y crea un respaldo de seguridad antes de escribir.
async function handleOrganize(body) {
  const auth = await resolveStremioAuth(body);
  const current = await getAddonCollection(auth);
  const nuvio = auth.platform === 'nuvio';
  let safetyBackupId = null;
  if (body.expectedFingerprint) {
    if (!fingerprintMatches(String(body.expectedFingerprint), current)) {
      throw new Error('Tus complementos cambiaron desde la instalación. Vuelve a conectar la cuenta antes de personalizar');
    }
    const extra = nuvio ? { nuvioCollections: await pullNuvioCollections(auth) } : null;
    safetyBackupId = await backupCollection(auth.identity, current, null, extra);
  } else {
    const backup = await readBackup(String(body.preparedBackupId || ''));
    if (!accountOwnsBackup(auth, backup) ||
        !fingerprintMatches(backup.fingerprint, current)) {
      throw new Error('Crea un respaldo nuevo de la colección actual antes de organizar');
    }
  }
  const order = body.order;
  if (!Array.isArray(order) || order.length !== current.length ||
      new Set(order).size !== current.length ||
      order.some(i => !Number.isInteger(i) || i < 0 || i >= current.length)) {
    throw new Error('El orden de complementos no es válido');
  }
  // Nuvio guarda sólo la URL de cada complemento: los catálogos se eligen dentro de la app.
  const catalogChoices = nuvio ? {} : (body.catalogChoices || {});
  const catalogNames = nuvio ? {} : (body.catalogNames || {});
  const edited = current.map((addon, index) => {
    const copy = deepClone(addon);
    const original = copy.manifest?.catalogs;
    if (Object.prototype.hasOwnProperty.call(catalogChoices, index)) {
      const selected = catalogChoices[index];
      if (!Array.isArray(selected) || (!Array.isArray(original) && selected.length)) {
        throw new Error('Selección de catálogos inválida');
      }
      if (Array.isArray(original)) {
        const keys = new Set(selected);
        const known = new Set(original.map(c => String(c.type) + ':' + String(c.id)));
        if ([...keys].some(key => !known.has(key))) throw new Error('Catálogo no reconocido');
        if (original.length && !keys.size) throw new Error('Deja al menos un catálogo por complemento');
        copy.manifest.catalogs = original.filter(c => keys.has(String(c.type) + ':' + String(c.id)));
      }
    }
    const names = catalogNames[index];
    if (names && typeof names === 'object' && Array.isArray(copy.manifest?.catalogs)) {
      copy.manifest.catalogs = copy.manifest.catalogs.map(c => {
        const key = String(c.type) + ':' + String(c.id);
        if (!Object.prototype.hasOwnProperty.call(names, key)) return c;
        const name = String(names[key] || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        return name ? { ...c, name } : c;
      });
    }
    return copy;
  });
  const desired = order.map(index => edited[index]);
  try {
    await setAddonCollection(auth, desired);
    const actual = await getAddonCollection(auth);
    const signature = addons => addons.map(a => nuvio ? { url: nuvioUrlKey(a) } : {
      url: a.transportUrl,
      catalogs: (a.manifest?.catalogs || []).map(c => String(c.type) + ':' + String(c.id) + ':' + String(c.name || ''))
    });
    if (JSON.stringify(signature(actual)) !== JSON.stringify(signature(nuvio ? uniqueNuvioAddons(desired) : desired))) {
      throw new Error('La app no confirmó el orden y los catálogos');
    }
    return { ok: true, count: actual.length, addons: addonSummary(actual),
      sourceFingerprint: collectionFingerprint(actual), safetyBackupId };
  } catch (error) {
    try { await setAddonCollection(auth, current); }
    catch (restoreError) { logError('Falló restauración tras organizar:', restoreError.message); }
    throw error;
  }
}

// Copia los complementos (y opcionalmente las colecciones) de un perfil de Nuvio a otros perfiles de la misma cuenta.
async function handleNuvioApplyProfiles(body) {
  const auth = await resolveStremioAuth({ ...body, platform: 'nuvio' });
  const known = new Map((auth.profiles || []).map(p => [Number(p.profile_index), p.name || p.profile_name || ('Perfil ' + p.profile_index)]));
  const targets = [...new Set((Array.isArray(body.targetProfiles) ? body.targetProfiles : []).map(Number))]
    .filter(id => id !== auth.profileId && known.has(id)).slice(0, 8);
  if (!targets.length) throw new Error('Elige al menos otro perfil de Nuvio');
  const source = await getAddonCollection(auth);
  if (!findAioAddon(source)) throw new Error('Este perfil todavía no tiene AIOStreams. Configúralo primero con el wizard.');
  const sourceCollections = body.includeCollections === false ? null : await pullNuvioCollections(auth);
  const urls = list => uniqueNuvioAddons(list).map(a => String(a.transportUrl || ''));
  const results = [];
  for (const profileId of targets) {
    const target = { ...auth, profileId, identity: auth.identity.replace(/:profile:\d+$/, ':profile:' + profileId) };
    const name = known.get(profileId);
    let current = null;
    try {
      current = await getAddonCollection(target);
      const previousCollections = await pullNuvioCollections(target);
      const backupId = await backupCollection(target.identity, current, null, { nuvioCollections: previousCollections });
      await setAddonCollection(target, source);
      const after = await getAddonCollection(target);
      if (JSON.stringify(urls(after)) !== JSON.stringify(urls(source))) {
        await setAddonCollection(target, current).catch(() => {});
        throw new Error('el perfil no quedó igual al de origen; se restauró su lista anterior');
      }
      let collections = false;
      if (Array.isArray(sourceCollections) && sourceCollections.length) {
        try { await pushNuvioCollections(target, sourceCollections); collections = true; }
        catch (error) { logError('Colecciones en perfil', profileId, error); }
      }
      const backup = await readBackup(backupId);
      results.push({ profileId, name, ok: true, backupId, backupLabel: backupLabel(backup), total: after.length, collections });
    } catch (error) {
      results.push({ profileId, name, ok: false, error: String(error?.message || error).slice(0, 200) });
    }
  }
  return { ok: results.every(r => r.ok), results };
}

async function handleRestore(body) {
  const backupId = String(body.backupId || '').trim();
  if (!backupId) throw new Error('Falta el respaldo a restaurar');
  const auth = await resolveStremioAuth(body);
  const backup = await readBackup(backupId);
  if (!accountOwnsBackup(auth, backup)) throw new Error('Ese respaldo pertenece a otra cuenta');
  await setAddonCollection(auth, backup.addons);
  let collectionsRestored = false;
  if (auth.platform === 'nuvio' && Array.isArray(backup.nuvioCollections)) {
    try { await pushNuvioCollections(auth, backup.nuvioCollections); collectionsRestored = true; }
    catch (error) { logError('No se restauraron las colecciones Nuvio:', error); }
  }
  return { ok: true, restored: backup.addons.length, createdAt: backup.createdAt, collectionsRestored,
    aioConfig: backup.aioSnapshot?.config || null,
    aioHost: backup.aioSnapshot?.host || null };
}

async function handleRestoreJson(body) {
  const auth = await resolveStremioAuth(body);
  const addons = body?.addons;
  if (!Array.isArray(addons) || addons.length === 0) {
    throw new Error('El JSON no contiene una colección válida de complementos');
  }
  for (const addon of addons) {
    if (!addon || typeof addon !== 'object' || !addon.transportUrl || !addon.manifest) {
      throw new Error('El JSON contiene un complemento inválido');
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

// ---- Revisar mi configuración: detecta complementos caídos o retirados en la cuenta del usuario ----
const RETIRED_ADDONS = [
  { match: (id, host) => id === 'com.stremio.thepiratebay.plus', name: 'ThePirateBay+', reason: 'retired' },
  { match: (id, host) => id === 'com.stremify' || host === 'stremify.hayd.uk', name: 'Stremify', reason: 'retired' },
  { match: (id, host) => host === 'enspanish.vercel.app', name: 'PeLis', reason: 'retired' },
  { match: (id, host) => id === 'community.argentinatv', name: 'Argentina TV', reason: 'retired' }
];

function addonHost(addon) {
  try { return new URL(normalizeManifestUrl(addon?.transportUrl)).host.toLowerCase(); } catch { return ''; }
}

function isSystemAddon(addon) {
  const url = normalizeManifestUrl(addon?.transportUrl);
  if (!/^https:\/\//i.test(url)) return true;                 // http local, protocolos internos
  if (addon?.flags?.protected) return true;                    // complementos protegidos de Stremio
  const host = addonHost(addon);
  return !host || /^(127\.|localhost|0\.0\.0\.0)/.test(host);
}

async function checkInstalledAddon(addon) {
  const id = String(addon?.manifest?.id || '').toLowerCase();
  const host = addonHost(addon);
  const name = addon?.manifest?.name || id || host || 'Complemento';
  const url = normalizeManifestUrl(addon?.transportUrl);
  const retired = RETIRED_ADDONS.find(r => r.match(id, host));
  if (retired) return { url, name, host, status: 'retired', detail: 'Ya no se mantiene; el wizard dejó de ofrecerlo.' };
  if (isSystemAddon(addon)) return { url, name, host, status: 'system' };
  if (addon?._nuvio && !addon._manifestSkipped) {
    return addon._manifestFailed ? { url, name, host, status: 'down', detail: 'No responde' } : { url, name, host, status: 'ok' };
  }
  try {
    const data = await fetchJson(url, {}, 9000);
    if (data && (data.id || data.manifest?.id)) return { url, name, host, status: 'ok' };
    return { url, name, host, status: 'down', detail: 'Respuesta inesperada' };
  } catch (error) {
    return { url, name, host, status: 'down', detail: String(error?.message || error).replace(/https?:\/\/\S+/g, '[url]').slice(0, 140) };
  }
}

async function handleCheckSetup(body) {
  const auth = await resolveStremioAuth(body);
  const addons = await getAddonCollection(auth);
  const list = auth.platform === 'nuvio' ? uniqueNuvioAddons(addons) : addons;
  // Límite de subsolicitudes del plan gratuito: en Stremio revisa como máximo 40 complementos;
  // en Nuvio los manifiestos ya se leyeron (hasta 24) y sólo se revisan unos pocos más.
  const toCheck = auth.platform === 'nuvio' ? list.slice(0, 34) : list.slice(0, 40);
  const results = await Promise.all(toCheck.map(checkInstalledAddon));
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const aio = findAioAddon(addons);
  console.log(JSON.stringify({ event: 'check_setup_result', platform: auth.platform || 'stremio', ok: true, down: counts.down || 0, retired: counts.retired || 0 }));
  return { ok: true, platform: auth.platform || 'stremio', total: list.length, checked: toCheck.length, counts,
    hasAio: !!aio, results, sourceFingerprint: collectionFingerprint(addons) };
}

// Quita complementos elegidos (caídos o retirados), con respaldo previo verificado.
async function handleRemoveAddons(body) {
  const auth = await resolveStremioAuth(body);
  const current = await getAddonCollection(auth);
  if (body.sourceFingerprint && !fingerprintMatches(body.sourceFingerprint, current)) {
    throw new Error('Los complementos cambiaron desde la revisión. Vuelve a revisar antes de quitar.');
  }
  const remove = new Set((Array.isArray(body.removeUrls) ? body.removeUrls : []).map(u => nuvioUrlKey({ transportUrl: String(u) })));
  if (!remove.size) throw new Error('Elige al menos un complemento para quitar');
  const removable = current.filter(a => remove.has(nuvioUrlKey(a)) && !isSystemAddon(a));
  if (!removable.length) throw new Error('Ninguno de los complementos elegidos se puede quitar');
  const keep = current.filter(a => !removable.includes(a));
  const nuvioCollections = auth.platform === 'nuvio' ? await pullNuvioCollections(auth) : null;
  const backupId = await backupCollection(auth.identity, current, null, auth.platform === 'nuvio' ? { nuvioCollections } : null);
  await setAddonCollection(auth, keep);
  const after = await getAddonCollection(auth);
  const stillThere = after.filter(a => remove.has(nuvioUrlKey(a)));
  if (stillThere.length) throw new Error('No se pudieron quitar todos; tu respaldo quedó guardado.');
  const backup = await readBackup(backupId);
  console.log(JSON.stringify({ event: 'remove_addons_result', platform: auth.platform || 'stremio', ok: true, removed: removable.length }));
  return { ok: true, removed: removable.map(a => a?.manifest?.name || addonHost(a)), total: after.length,
    backupId, backupLabel: backupLabel(backup) };
}

// ---- Vigilante de complementos: revisa que cada servicio que el wizard instala responda ----
let ADDON_HEALTH_CACHE = null;
const ADDON_HEALTH_STATIC = [
  { key: 'aiostreams', name: 'AIOStreams (instance)', url: AIO_BASE + '/api/v1/status', expect: d => d?.success === true },
  { key: 'aiometadata', name: 'AIOMetadata', url: AIOMETA_BASE + '/api/config', expect: d => !!d && typeof d === 'object' },
  { key: 'tamtaro', name: 'Tamtaro template', url: TAMTARO_URL, expect: d => Array.isArray(d) && d.some(x => x?.metadata?.id === 'tamtaro.complete') },
  { key: 'watchly', name: 'Watchly', url: WATCHLY_BASE + '/health', expect: d => d?.status === 'healthy' },
  { key: 'postersplus', name: 'PostersPlus', url: POSTERSPLUS_BASE + '/server-caps', expect: d => Array.isArray(d?.presets) && d.presets.length > 0 },
  { key: 'peerflix', name: 'Peerflix', url: 'https://addon.peerflix.mov/manifest.json' },
  { key: 'cometa', name: 'Cometa', url: 'https://cometa.stremx.net/manifest.json' },
  { key: 'latinobrid', name: 'Latinobrid', url: 'https://latinobrid.stremx.net/manifest.json' },
  { key: 'animes', name: 'AnimES', url: 'https://pigamer37.alwaysdata.net/onAirCatalogs=animeav1/manifest.json' },
  { key: 'linkanol', name: 'Linkañol', url: 'https://8bcec99c5d97-spanish-links-addon.baby-beamup.club/manifest.json' }
];
const ADDON_HEALTH_PRESET = [
  ['cinemeta', 'Cinemeta'], ['streailer', 'Streailer'], ['subsense', 'SubSense'],
  ['opensubtitlespro', 'OpenSubtitles PRO'], ['jackettio', 'Jackettio'], ['torrentsdb', 'TorrentsDB']
];

async function checkAddonTarget(target) {
  const started = Date.now();
  try {
    const data = await fetchJson(target.url, {}, 12000);
    const ok = target.expect ? !!target.expect(data) : !!(data && (data.id || data.manifest?.id));
    return { key: target.key, name: target.name, host: new URL(target.url).host, ok, ms: Date.now() - started,
      error: ok ? null : 'Unexpected response' };
  } catch (error) {
    return { key: target.key, name: target.name, host: new URL(target.url).host, ok: false, ms: Date.now() - started,
      error: String(error?.message || error).replace(/https?:\/\/\S+/g, '[url]').slice(0, 160) };
  }
}

async function computeAddonHealth() {
  const targets = [...ADDON_HEALTH_STATIC];
  let presetOk = true, presetError = null;
  try {
    const preset = await fetchJson(PRESET_URL, {}, 15000);
    for (const [key, name] of ADDON_HEALTH_PRESET) {
      const addon = preset?.languages?.en?.[key];
      if (addon?.transportUrl) targets.push({ key, name, url: normalizeManifestUrl(addon.transportUrl) });
      else targets.push({ key, name, url: 'https://invalid.invalid/', expect: () => false });
    }
    if (preset?.extras?.kitsu?.transportUrl) targets.push({ key: 'kitsu', name: 'Anime Kitsu', url: normalizeManifestUrl(preset.extras.kitsu.transportUrl) });
  } catch (error) {
    presetOk = false; presetError = String(error?.message || error).slice(0, 160);
  }
  const results = await Promise.all(targets.map(checkAddonTarget));
  results.unshift({ key: 'bootstrapper-preset', name: 'Bootstrapper preset', host: 'raw.githubusercontent.com', ok: presetOk, ms: null, error: presetError });
  const failing = results.filter(r => !r.ok).map(r => r.key);
  console.log(JSON.stringify({ event: 'addon_health', failing, total: results.length }));
  return { wizard: WIZARD_VERSION, checkedAt: new Date().toISOString(), ok: failing.length === 0, failing, results };
}

async function handleAddonHealth() {
  if (ADDON_HEALTH_CACHE && Date.now() - ADDON_HEALTH_CACHE.at < 10 * 60 * 1000) return ADDON_HEALTH_CACHE.value;
  const value = await computeAddonHealth();
  ADDON_HEALTH_CACHE = { at: Date.now(), value };
  return value;
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
  'POST /api/nuvio-apply-profiles': handleNuvioApplyProfiles,
  'POST /api/check-setup': handleCheckSetup,
  'POST /api/remove-addons': handleRemoveAddons,
  'POST /api/restore-json': handleRestoreJson,
  'POST /api/validate-addon': async body => {
    const addon = await customAddonFromUrl(body.url);
    return { ok: true, name: addon.manifest.name, id: addon.manifest.id, resources: addon.manifest.resources || [] };
  }
};

// Devuelve { status, body } o null si la ruta no es de la API.
async function handleApi(method, pathname, body) {
  if (method === 'GET' && pathname === '/api/health') return { status: 200, body: await handleHealth() };
  if (method === 'GET' && pathname === '/api/addon-health') return { status: 200, body: await handleAddonHealth() };
  const handler = ROUTES[method + ' ' + pathname];
  if (!handler) return pathname.startsWith('/api/') ? { status: 404, body: { error: 'No encontrado' } } : null;
  const started = Date.now();
  try {
    const result = { status: 200, body: await handler(body || {}) };
    recordStep(pathname, body, true, started, null);
    return result;
  } catch (error) {
    // No registrar URLs completas: pueden llevar claves Debrid o tokens.
    const safe = String(error?.message || error).replace(/https?:\/\/([^\/\s'"]+)[^\s'"]*/g, 'https://$1/…');
    logError(new Date().toISOString(), method, pathname, safe);
    recordStep(pathname, body, false, started, error);
    return { status: 400, body: { error: error?.message || 'Error inesperado' } };
  }
}

// Contadores anónimos por paso: sólo el paso, la app, si funcionó y un tipo de error genérico.
// Nunca se registran correos, contraseñas, claves, URLs ni el texto del error.
function errorType(error) {
  const m = String(error?.message || error || '').toLowerCase();
  if (/abort|timeout|timed out|tiempo de espera/.test(m)) return 'timeout';
  if (/429|too many|demasiad|rate limit|limitando/.test(m)) return 'rate_limit';
  if (/no tiene perfiles/.test(m)) return 'nuvio_no_profile';
  if (/http 400/.test(m)) return 'http_400';
  if (/contraseña|incorrect|password|credencial|credential|login|sesión|session|unauthorized|401|invalid_grant/.test(m)) return 'auth';
  if (/clave|api key|apikey|token/.test(m)) return 'key';
  if (/respaldo|backup/.test(m)) return 'backup';
  if (/aiostreams|aio\b/.test(m)) return 'aiostreams';
  if (/nuvio/.test(m)) return 'nuvio';
  if (/stremio/.test(m)) return 'stremio';
  if (/429|too many|demasiad/.test(m)) return 'rate_limit';
  return 'other';
}

function recordStep(pathname, body, ok, started, error) {
  try {
    const platform = body?.platform || body?.target?.platform || null;
    console.log(JSON.stringify({ event: 'step', step: String(pathname).replace(/^\/api\//, ''),
      platform: platform === 'nuvio' || platform === 'stremio' ? platform : null,
      ok, ms: Date.now() - started, ...(ok ? {} : { error: errorType(error) }) }));
  } catch {}
}

module.exports = { configure, handleApi, WIZARD_VERSION, buildAioConfig, buildStandaloneAddons, normalizeOptions,
  languageProfile, backupCollection, readBackup, parseAioManifest, handleAioPush, createOrUpdateAio,
  handleTransferPreview, handleTransferApply, transferDesired, createWatchlyAddon, addonPlan,
  _configureAioMetadata: configureAioMetadata };
