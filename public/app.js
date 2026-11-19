function syncDocumentTitle(){document.title='Stremio & Nuvio Wizard';}
syncDocumentTitle();
window.addEventListener('pageshow',syncDocumentTitle);
document.addEventListener('visibilitychange',function(){if(!document.hidden)syncDocumentTitle();});

var connected = false;
var backupReady = false;
var preparedBackupId = '';
var analysisDone = false;
var aioPushPlan = null;
var aioInstancePlan = null;
var lastBackupId = '';
var lastRecovery = null;
var latestTamtaro = null;
var installedAddons = [];
var organizerOrder = [];
var organizerCatalogs = {};
var rememberedStorageKey = 'stremio-wizard-account-v1';
var restoringRemembered = false;
var currentWizardStep = 1;
var maxWizardStep = 1;
var installationComplete = false;
var latestSourceFingerprint = '';
function showWizardStep(step){
  step=Number(step);
  if(step<1||step>maxWizardStep)return;
  if(step>=2&&!connected)return;
  if(step>=3&&!backupReady&&step!==currentWizardStep&&!(installationComplete&&step===5))return;
  currentWizardStep=step;
  document.querySelectorAll('[data-step]').forEach(function(el){el.hidden=Number(el.dataset.step)!==step;});
  document.querySelectorAll('.steps button').forEach(function(btn){
    var n=Number(btn.dataset.goto);
    btn.disabled=(n>currentWizardStep&&!(installationComplete&&n===5))||n>maxWizardStep||n>=2&&!connected||n>=3&&!backupReady&&!(installationComplete&&n===5);
    btn.classList.toggle('active',n===step);
    btn.classList.toggle('done',n<step);
    if(n===step)btn.setAttribute('aria-current','step');else btn.removeAttribute('aria-current');
  });
  window.scrollTo({top:0,behavior:'smooth'});
  syncFloatingNext();
}
function advanceWizardStep(step){maxWizardStep=Math.max(maxWizardStep,step);showWizardStep(step);}
function resetWizardStep(step){maxWizardStep=step;showWizardStep(step);}
function bytesToBase64(bytes){
  var binary='';
  bytes.forEach(function(byte){binary+=String.fromCharCode(byte);});
  return btoa(binary);
}
function base64ToBytes(value){
  return Uint8Array.from(atob(value),function(char){return char.charCodeAt(0);});
}
function keyStore(mode,action){
  return new Promise(function(resolve,reject){
    var open=indexedDB.open('stremio-wizard',1);
    open.onupgradeneeded=function(){open.result.createObjectStore('keys');};
    open.onerror=function(){reject(open.error);};
    open.onsuccess=function(){
      var db=open.result,tx=db.transaction('keys',mode),req=action(tx.objectStore('keys'));
      tx.oncomplete=function(){db.close();resolve(req&&req.result);};
      tx.onerror=function(){db.close();reject(tx.error);};
    };
  });
}
async function rememberedCryptoKey(){
  if(!crypto.subtle||!window.indexedDB)throw new Error('Este navegador no permite guardar la cuenta de forma cifrada.');
  try{localStorage.removeItem('stremio-wizard-local-crypto-v1');}catch(_){}
  var key=await keyStore('readonly',function(store){return store.get('remember-v2');});
  if(!key){
    // Clave no exportable: el navegador la usa, pero ningún script puede leerla ni copiarla.
    key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    await keyStore('readwrite',function(store){return store.put(key,'remember-v2');});
  }
  return key;
}
function syncForgetButton(){
  document.getElementById('forgetAccount').style.display=localStorage.getItem(rememberedStorageKey)&&document.getElementById('platform').value==='stremio'?'inline-block':'none';
}
async function saveRememberedAccount(authKey,email){
  var iv=crypto.getRandomValues(new Uint8Array(12));
  var data=new TextEncoder().encode(JSON.stringify({authKey:authKey,email:email||''}));
  var encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv},await rememberedCryptoKey(),data);
  localStorage.setItem(rememberedStorageKey,JSON.stringify({v:2,iv:bytesToBase64(iv),data:bytesToBase64(new Uint8Array(encrypted))}));
  syncForgetButton();
}
function forgetRememberedAccount(){
  localStorage.removeItem(rememberedStorageKey);
  document.getElementById('rememberAccount').checked=false;
  syncForgetButton();
}
async function restoreRememberedAccount(){
  var saved=localStorage.getItem(rememberedStorageKey);
  if(!saved)return;
  try{
    var record=JSON.parse(saved);
    if(record.v!==2){forgetRememberedAccount();return;}
    var plain=await crypto.subtle.decrypt(
      {name:'AES-GCM',iv:base64ToBytes(record.iv)},
      await rememberedCryptoKey(),
      base64ToBytes(record.data)
    );
    var account=JSON.parse(new TextDecoder().decode(plain));
    if(!account.authKey)throw new Error('Falta la AuthKey');
    document.getElementById('email').value=account.email||'';
    document.getElementById('authKey').value=account.authKey;
    document.getElementById('rememberAccount').checked=true;
    restoringRemembered=true;
    document.getElementById('connectBtn').click();
  }catch(_){
    forgetRememberedAccount();
    document.getElementById('accountHint').textContent='No se pudo recuperar la cuenta guardada. Conéctala de nuevo.';
  }
}
function addonIdentity(a){
  return String(a.id || '').trim().toLowerCase() || String(a.url || '').trim().toLowerCase();
}
function downloadJsonFile(name,value){
  var blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
  var link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();
  setTimeout(function(){URL.revokeObjectURL(link.href);},1000);
}
async function copyTextValue(text,button,doneLabel){
  var original=button.textContent;
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(text);
    else{
      var area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';
      document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    button.textContent=doneLabel||'Copiado ✓';
  }catch(_){button.textContent='No se pudo copiar';}
  setTimeout(function(){button.textContent=original;},2200);
}
function downloadInstalledList(){
  var lines=['# Complementos instalados en '+platformName(),'Exportado: '+new Date().toLocaleString(),'','Las URL configuradas pueden contener claves privadas. Guarda esta lista en privado.',''];
  installedAddons.forEach(function(a){
    lines.push(a.index+'. '+a.name);
    lines.push('ID: '+(a.id||'(sin ID)'));
    lines.push('URL: '+(a.url||'(sin URL)'));
    lines.push('');
  });
  var blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
  var link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=platformName().toLowerCase()+'-addons-instalados-'+new Date().toISOString().slice(0,10)+'.txt';
  link.click();
  setTimeout(function(){URL.revokeObjectURL(link.href);},1000);
}
function showInstalledAddons(addons){
  installedAddons=Array.isArray(addons)?addons:[];
  syncAioInstallMode(true);
  var box=document.getElementById('installedAddons');
  var counts={};
  installedAddons.forEach(function(a){var key=addonIdentity(a);if(key)counts[key]=(counts[key]||0)+1;});
  var repeated=Object.keys(counts).filter(function(key){return counts[key]>1;});
  var html='<h3>Complementos instalados ('+installedAddons.length+')</h3>'+
    '<div class="small">Puedes guardar nombres y URL para reinstalarlos manualmente. Las URL pueden incluir claves privadas.</div>'+
    '<div class="actions"><button class="secondary" id="downloadInstalled">Descargar lista de complementos y URL</button></div>';
  if(repeated.length)html+='<p class="small" style="color:#ffdc93">⚠ '+repeated.length+' ID de complemento repetido'+(repeated.length===1?'':'s')+'. Revisa las variantes antes de conservarlas.</p>';
  html+='<details class="installedDisclosure"><summary>Ver complementos instalados ('+installedAddons.length+')</summary>';
  installedAddons.forEach(function(a){
    var key=addonIdentity(a),dup=key&&counts[key]>1;
    html+='<div class="check" style="margin-top:8px;display:block"><b>'+esc(a.index+'. '+a.name)+'</b>'+
      (dup?' <span class="rec-tag tag-redundant">ID REPETIDO</span>':'')+
      '<div class="small">ID: '+esc(a.id||'Sin ID')+'</div><div class="small" style="overflow-wrap:anywhere">URL: '+esc(a.url||'No disponible')+'</div>'+
      (a.url?'<button class="secondary copyAddonUrl" type="button" data-index="'+(a.index-1)+'" style="margin-top:8px;padding:7px 11px">Copiar URL</button>':'')+'</div>';
  });
  html+='</details>';
  box.className='result note show';
  box.innerHTML=html;
  document.getElementById('downloadInstalled').addEventListener('click',downloadInstalledList);
  box.querySelectorAll('.copyAddonUrl').forEach(function(btn){
    btn.addEventListener('click',async function(){
      var url=installedAddons[Number(btn.dataset.index)]?.url;
      if(!url)return;
      try{
        await navigator.clipboard.writeText(url);
        btn.textContent='URL copiada ✓';
        setTimeout(function(){btn.textContent='Copiar URL';},2200);
      }catch(_){
        btn.textContent='No se pudo copiar';
        setTimeout(function(){btn.textContent='Copiar URL';},2200);
      }
    });
  });
}

function hasInstalledAio(){
  return installedAddons.some(function(a){return /aiostreams/i.test([a.name,a.id,a.url].join(' '));});
}
function syncAioInstallMode(){
  var exists=hasInstalledAio();
  document.getElementById('aioExportField').hidden=!exists;
  document.getElementById('backupIntro').textContent=exists
    ?'Guardaremos tus complementos y sus URL antes de instalar un AIOStreams nuevo. El AIOStreams anterior no se modificará; puedes añadir una copia de sus ajustes si ya tienes la exportación.'
    :'Guardaremos tus complementos y después instalaremos AIOStreams. No necesitas una exportación JSON.';
}
function catalogKey(c){return c.type+':'+c.id;}
function renderOrganizer(reset){
  if(reset||organizerOrder.length!==installedAddons.length){
    organizerOrder=installedAddons.map(function(_,i){return i;});
    organizerCatalogs={};
    installedAddons.forEach(function(a,i){
      organizerCatalogs[i]=(a.catalogs||[]).map(catalogKey);
    });
  }
  var html='';
  organizerOrder.forEach(function(index,position){
    var a=installedAddons[index];
    html+='<div class="check" style="display:block;margin:8px 0"><b>'+esc(a.name)+'</b> <span class="small">('+esc(a.id)+')</span>'+
      '<div class="actions"><button class="secondary orderMove" type="button" data-position="'+position+'" data-dir="-1" '+(position===0?'disabled':'')+'>↑ Subir</button>'+
      '<button class="secondary orderMove" type="button" data-position="'+position+'" data-dir="1" '+(position===organizerOrder.length-1?'disabled':'')+'>↓ Bajar</button></div>';
    if(platformName()!=='Nuvio'&&a.catalogs&&a.catalogs.length){
      html+='<details><summary class="small">Catálogos ('+a.catalogs.length+')</summary>';
      a.catalogs.forEach(function(c){
        var key=catalogKey(c),checked=(organizerCatalogs[index]||[]).includes(key);
        html+='<label class="small" style="display:block;margin:5px 0"><input class="organizerCatalog" type="checkbox" data-index="'+index+'" data-key="'+esc(key)+'" '+(checked?'checked':'')+'> '+esc(c.name)+'</label>';
      });
      html+='</details>';
    }
    html+='</div>';
  });
  document.getElementById('organizerList').innerHTML=html;
}
function exportWizardProfile(){
  var c=collect();
  var profile={format:'stremio-wizard-profile-v1',language:c.language,profileMode:c.profileMode,instanceMode:c.instanceMode,
    noDebrid:c.noDebrid,
    debridServices:c.noDebrid?[]:Array.from(document.querySelectorAll('.debrid .service')).map(function(x){return x.value;}),
    tmdbMode:c.tmdbMode,tvdbMode:c.tvdbMode,rpdbMode:c.rpdbMode,
    kids:c.kids,anime:c.anime,argentinaTv:c.argentinaTv,no4k:c.no4k,
    cachedOnly:c.cachedOnly,removeWatchHub:c.removeWatchHub,
    trailers:c.trailers,subtitles:c.subtitles,openSubtitles:c.openSubtitles,
    stores:c.stores,standaloneAddons:c.standaloneAddons,
    audioLanguages:c.audioLanguages,subtitleLanguages:c.subtitleLanguages,watchly:c.watchly};
  downloadJsonFile('Stremio-Wizard-perfil-sin-claves.json',profile);
}
var serviceNames = {
  torbox:'TorBox',
  realdebrid:'Real-Debrid',
  premiumize:'Premiumize',
  alldebrid:'AllDebrid',
  debridlink:'Debrid-Link',
  easydebrid:'EasyDebrid'
};

var serviceApiLinks = {
  torbox:'https://torbox.app/settings',
  realdebrid:'https://real-debrid.com/apitoken',
  premiumize:'https://www.premiumize.me/account',
  alldebrid:'https://alldebrid.com/apikeys',
  debridlink:'https://debrid-link.com/webapp/apikey',
  easydebrid:'https://paradise-cloud.com/dashboard/'
};

var freeStandaloneAddons = new Set(['comet','webstreamr','sootiohttp','torrentsdb','stremthru','mediafusion','cometa','animes']);
function isFreeMode(){return document.getElementById('debridMode').value==='free';}
function rememberCheckboxState(input,free){
  var card=input.closest('.check');
  if(free){
    if(input.dataset.freePrevious===undefined)input.dataset.freePrevious=input.checked?'1':'0';
    input.checked=false;input.disabled=true;
    if(card)card.classList.add('freeUnavailable');
  }else{
    input.disabled=false;
    if(input.dataset.freePrevious!==undefined){input.checked=input.dataset.freePrevious==='1';delete input.dataset.freePrevious;}
    if(card)card.classList.remove('freeUnavailable');
  }
}
function syncDebridMode(markChanged){
  var free=isFreeMode();
  document.getElementById('withDebridBtn').classList.toggle('active',!free);
  document.getElementById('noDebridBtn').classList.toggle('active',free);
  document.getElementById('debridFields').hidden=free;
  document.getElementById('freeModeNote').hidden=!free;
  document.getElementById('freeAddonNotice').hidden=!free;

  ['cachedOnly','stores'].forEach(function(id){
    var input=document.getElementById(id),card=input.closest('.check');
    if(free){
      if(input.dataset.freePrevious===undefined)input.dataset.freePrevious=input.checked?'1':'0';
      input.checked=false;input.disabled=true;if(card)card.classList.add('freeUnavailable');
    }else{
      input.disabled=false;
      if(input.dataset.freePrevious!==undefined){input.checked=input.dataset.freePrevious==='1';delete input.dataset.freePrevious;}
      if(card)card.classList.remove('freeUnavailable');
    }
  });

  document.querySelectorAll('.standaloneAddon').forEach(function(input){
    if(freeStandaloneAddons.has(input.value)){
      input.disabled=false;
      input.closest('.check')?.classList.remove('freeUnavailable');
      return;
    }
    rememberCheckboxState(input,free);
  });

  var debridio=document.getElementById('debridioKey');
  debridio.disabled=free;
  document.getElementById('debridioField').hidden=free;

  if(markChanged&&backupReady)clearReview('Cambiaste el modo de streaming: revisa nuevamente el plan.');
  syncPelisAvailability();
  syncFloatingNext();
}

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function setBusy(btn,busy,label){
  if(!btn.dataset.original) btn.dataset.original=window.wizardOriginal?window.wizardOriginal(btn.textContent):btn.textContent;
  btn.disabled=busy;
  btn.innerHTML=busy?'<span class="spinner"></span>'+esc(label||'Procesando…'):btn.dataset.original;
}

function authPayload(){
  return {
    platform:document.getElementById('platform').value,
    profileId:Number(document.getElementById('profileId').value)||0,
    email:document.getElementById('email').value.trim(),
    password:document.getElementById('password').value,
    authKey:document.getElementById('authKey').value.trim()
  };
}

function hasAuth(a){
  return a.platform==='nuvio' ? !!a.email && !!a.password : !!a.authKey || (!!a.email && !!a.password);
}
function platformName(){return document.getElementById('platform').value==='nuvio'?'Nuvio':'Stremio';}
function syncPlatform(){
  var nuvio=platformName()==='Nuvio';
  document.getElementById('accountTitle').textContent='1 · Conecta tu cuenta '+platformName();
  document.getElementById('nuvioProfileField').hidden=!nuvio;
  document.getElementById('stremioAuthField').hidden=nuvio;
  document.getElementById('rememberAccountField').hidden=nuvio;
  var collectionsField=document.getElementById('nuvioCollectionsField');
  if(collectionsField)collectionsField.hidden=!nuvio;
  // Streailer y WatchHub son propios de Stremio: en Nuvio no se instalan, así que no se muestran.
  ['trailers','removeWatchHub'].forEach(function(id){
    var input=document.getElementById(id);
    if(input&&input.closest('.check'))input.closest('.check').hidden=nuvio;
  });
  syncForgetButton();
  ['stremio','nuvio'].forEach(function(choice){
    var button=document.getElementById('platform'+(choice==='nuvio'?'Nuvio':'Stremio'));
    var active=document.getElementById('platform').value===choice;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
  document.getElementById('accountHint').textContent='Este paso no cambia tus complementos.';
  document.getElementById('applyIntro').textContent='Comprueba qué se añadirá, reemplazará o conservará antes de cambiar '+platformName()+'.';
  document.getElementById('confirmPlanHint').textContent='Se creará un AIOStreams nuevo y se reemplazará su entrada en '+(nuvio?'tu perfil de Nuvio':'Stremio')+'. Puedes abrir «Ver cambios automáticos» para revisar cada complemento; la URL anterior queda en el respaldo.';
  var applyButton=document.getElementById('configureBtn');
  applyButton.dataset.original='Aplicar en '+platformName();
  if(!applyButton.dataset.busy)applyButton.textContent=applyButton.dataset.original;
}
['stremio','nuvio'].forEach(function(choice){
  document.getElementById('platform'+(choice==='nuvio'?'Nuvio':'Stremio')).addEventListener('click',function(){
    var input=document.getElementById('platform');
    if(input.value===choice)return;
    input.value=choice;
    input.dispatchEvent(new Event('change'));
  });
});
document.getElementById('platform').addEventListener('change',function(){
  document.getElementById('password').value='';
  document.getElementById('authKey').value='';
  document.getElementById('profileId').innerHTML='<option value="1">Se detectará al conectar</option>';
  disconnectState('Elige la cuenta de '+platformName()+' y vuelve a conectar.');
  syncPlatform();
});
document.getElementById('profileId').addEventListener('change',function(){
  disconnectState('Conecta el perfil de Nuvio seleccionado para crear su respaldo.');
  if(hasAuth(authPayload()))document.getElementById('connectBtn').click();
});
syncPlatform();

function collect(){
  syncPelisAvailability();
  var auth=authPayload();
  var free=isFreeMode();
  var debrids=free?[]:Array.from(document.querySelectorAll('.debrid')).map(function(row){
    return {
      service:row.querySelector('.service').value,
      key:row.querySelector('.key').value.trim()
    };
  }).filter(function(x){return x.key;});

  return Object.assign({},auth,{
    noDebrid:free,
    language:document.getElementById('language').value,
    audioLanguages:languageOrderCustomized?languageOrder.audio.slice():[],
    subtitleLanguages:languageOrderCustomized?languageOrder.subtitle.slice():[],
    watchly:document.getElementById('watchly').checked,
    profileMode:document.getElementById('profileMode').value,
    instanceMode:document.getElementById('instanceMode').value,
    aioInstallMode:document.getElementById('aioInstallMode').value,
    debrids:debrids,
    debridioKey:free?'':document.getElementById('debridioKey').value.trim(),
    tmdbMode:document.getElementById('tmdbMode').value,
    tvdbMode:document.getElementById('tvdbMode').value,
    rpdbMode:document.getElementById('rpdbMode').value,
    tmdbKey:document.getElementById('tmdbMode').value==='personal'?document.getElementById('tmdbKey').value.trim():'',
    tvdbKey:document.getElementById('tvdbMode').value==='personal'?document.getElementById('tvdbKey').value.trim():'',
    rpdbKey:document.getElementById('rpdbMode').value==='personal'?document.getElementById('rpdbKey').value.trim():'',
    mdblistKey:document.getElementById('mdblistKey').value.trim(),
    kids:document.getElementById('kids').checked,
    anime:document.getElementById('anime').checked,
    argentinaTv:false,
    nuvioCollections:!!(document.getElementById('nuvioCollections')&&document.getElementById('nuvioCollections').checked),
    no4k:document.getElementById('no4k').checked,
    cachedOnly:free?false:document.getElementById('cachedOnly').checked,
    removeWatchHub:document.getElementById('removeWatchHub').checked,
    trailers:document.getElementById('trailers').checked,
    subtitles:document.getElementById('subtitles').checked,
    openSubtitles:document.getElementById('openSubtitles').checked,
    stores:free?false:document.getElementById('stores').checked,
    standaloneAddons:Array.from(document.querySelectorAll('.standaloneAddon:checked')).map(function(x){return x.value;}).filter(function(x){return !free||freeStandaloneAddons.has(x);}),
    customAddons:document.getElementById('customAddons').value.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean),
    keepIndices:analysisDone
      ?Array.from(document.querySelectorAll('.keepExisting:checked')).map(function(x){return Number(x.value);})
      :null
  });
}

var backupVaultKey='stremio-wizard-backups-v2';
function backupVaultList(){
  try{var v=JSON.parse(localStorage.getItem(backupVaultKey)||'[]');return Array.isArray(v)?v.filter(function(x){return typeof x==='string'&&x.indexOf('b2.')===0;}):[];}
  catch(_){return [];}
}
function backupVaultAdd(token){
  if(typeof token!=='string'||token.indexOf('b2.')!==0)return;
  var list=[token].concat(backupVaultList().filter(function(x){return x!==token;}));
  for(var n=Math.min(list.length,8);n>0;n--){
    try{localStorage.setItem(backupVaultKey,JSON.stringify(list.slice(0,n)));return;}catch(_){}
  }
}
async function post(url,body){
  if(url==='/api/connect'||url==='/api/analyze')body=Object.assign({},body,{storedBackups:backupVaultList()});
  var data=await postRaw(url,body);
  if(data&&data.backupId)backupVaultAdd(data.backupId);
  if(data&&data.safetyBackupId)backupVaultAdd(data.safetyBackupId);
  if(data&&Array.isArray(data.results))data.results.forEach(function(r){if(r&&r.backupId)backupVaultAdd(r.backupId);});
  return data;
}
async function postRaw(url,body){
  var r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  var data=await r.json();
  if(!r.ok) throw new Error(data.error||'Error');
  return data;
}

function setSetupLocked(locked){
  document.querySelectorAll('.setupCard').forEach(function(card){
    card.classList.toggle('locked',locked);
  });
}

function setBackupLocked(locked){
  document.getElementById('backupCard').classList.toggle('locked',locked);
  document.getElementById('backupBtn').disabled=locked;
  document.getElementById('restoreJsonBtn').disabled=locked;
}

function clearReview(message){
  analysisDone=false;
  document.getElementById('confirmPlanCheck').checked=false;
  document.getElementById('confirmPlanCheck').disabled=true;
  document.getElementById('confirmPlan').hidden=true;
  aioPushPlan=null;
  aioInstancePlan=null;
  document.getElementById('aioPushBtn').disabled=true;
  document.getElementById('configureBtn').disabled=true;
  var box=document.getElementById('analysisResult');
  box.className='result note';
  box.textContent='';
  var previous=document.getElementById('configureResult');
  if(previous.classList.contains('bad')){
    previous.className='result note';
    previous.textContent='';
  }
  if(message) document.getElementById('workHint').textContent=message;
}

function disconnectState(message){
  latestSourceFingerprint='';
  document.getElementById('copyAccountsDialog').close();
  connected=false;
  installationComplete=false;
  aioPushPlan=null;
  aioInstancePlan=null;
  document.getElementById('aioPushBtn').disabled=true;
  backupReady=false;
  preparedBackupId='';
  analysisDone=false;
  installedAddons=[];
  syncAioInstallMode(true);
  document.getElementById('organizer').hidden=true;
  document.getElementById('installedAddons').className='result note';
  document.getElementById('installedAddons').textContent='';
  document.getElementById('nextAccount').hidden=true;
  document.getElementById('checkSetupBtn').hidden=true;
  document.getElementById('checkSetupResult').className='result note';
  document.getElementById('checkSetupResult').textContent='';
  document.getElementById('nextBackup').hidden=true;
  document.getElementById('backupBtn').className='primary';
  document.getElementById('backupBtn').textContent='Crear respaldo seguro';
  document.getElementById('backupBtn').dataset.original='Crear respaldo seguro';
  document.querySelector('.backupCallout .section-kicker').textContent='PASO NECESARIO PARA CONTINUAR';
  document.querySelector('.backupCallout p').innerHTML='<b>Crea un respaldo antes de continuar.</b> El wizard verificará la lista actual de complementos. Al terminar, podrás pasar a preferencias.';
  setBackupLocked(true);
  setSetupLocked(true);
  resetWizardStep(1);
  document.getElementById('configureBtn').disabled=true;
  document.getElementById('restoreBtn').style.display='none';
  var b=document.getElementById('backupStatus');
  b.className='result note';
  b.textContent='';
  if(message) document.getElementById('accountHint').textContent=message;
}

async function validateKeyInput(input, service) {
  var key=input.value.trim(),status=input.parentElement.querySelector('.keyStatus');
  if(!status)return 'unknown';
  if(!key){
    status.textContent='';
    input.dataset.keyCheck='';
    return 'invalid';
  }
  if(input.dataset.checkedValue===service+':'+key && input.dataset.keyCheck && input.dataset.keyCheck!=='checking')
    return input.dataset.keyCheck;
  var request=String(Number(input.dataset.keyRequest||0)+1);
  input.dataset.keyRequest=request;
  input.dataset.keyCheck='checking';
  status.textContent='Comprobando clave…';
  status.style.color='';
  try{
    var result=await post('/api/validate-key',{service:service,key:key});
    if(input.dataset.keyRequest!==request||input.value.trim()!==key)return 'changed';
    input.dataset.keyCheck=result.status;
    input.dataset.checkedValue=service+':'+key;
    status.textContent=(result.status==='valid'?'✓ ':result.status==='invalid'?'✗ ':'ⓘ ')+result.message;
    status.style.color=result.status==='invalid'?'#ff9da5':result.status==='valid'?'#9ce6c9':'#ffdc93';
    return result.status;
  }catch(_){
    if(input.dataset.keyRequest!==request)return 'changed';
    input.dataset.keyCheck='unknown';
    status.textContent='ⓘ No se pudo comprobar la clave ahora. Puedes continuar y revisar después.';
    status.style.color='#ffdc93';
    return 'unknown';
  }
}
async function checkEnteredKeys(step){
  if(step===3&&isFreeMode())return true;
  var entries=step===3
    ?Array.from(document.querySelectorAll('.debrid')).map(function(row){return {input:row.querySelector('.key'),service:row.querySelector('.service').value};})
    :['tmdb','tvdb','rpdb'].filter(function(s){return document.getElementById(s+'Mode').value==='personal';})
      .map(function(s){return {input:document.getElementById(s+'Key'),service:s};})
      .concat(document.getElementById('mdblistKey').value.trim()?[{input:document.getElementById('mdblistKey'),service:'mdblist'}]:[]);
  var results=await Promise.all(entries.map(function(item){return validateKeyInput(item.input,item.service);}));
  var index=results.findIndex(function(result){return result==='invalid'||result==='changed';});
  if(index>=0){entries[index].input.focus();return false;}
  return true;
}

function addDebrid(service){
  var row=document.createElement('div');
  row.className='debrid';
  row.innerHTML=
    '<div><label>Servicio</label><select class="service">'+
    Object.keys(serviceNames).map(function(k){
      return '<option value="'+k+'"'+(k===service?' selected':'')+'>'+serviceNames[k]+'</option>';
    }).join('')+
    '</select></div>'+
    '<div><label>API key</label><input class="key" type="password" autocomplete="off" placeholder="API key">'+
    '<div class="linkrow"><a class="link apiKeyLink" target="_blank" rel="noreferrer noopener">Obtener API key ↗</a></div><div class="small keyStatus" role="status"></div></div>'+
    '<button class="danger remove" title="Quitar">×</button>';
  document.getElementById('debridList').appendChild(row);

  function sync(){
    var s=row.querySelector('.service').value;
    var link=row.querySelector('.apiKeyLink');
    link.href=serviceApiLinks[s]||'#';
    link.style.display=serviceApiLinks[s]?'inline':'none';
    var key=row.querySelector('.key');key.dataset.keyCheck='';key.dataset.checkedValue='';
    row.querySelector('.keyStatus').textContent='';
    if(key.value.trim())validateKeyInput(key,s);
    if(backupReady) clearReview('Cambiaste opciones: revisa nuevamente el plan.');
  }
  row.querySelector('.service').addEventListener('change',sync);
  row.querySelector('.key').addEventListener('input',function(){
    this.dataset.keyCheck='';this.dataset.checkedValue='';
    var input=this,service=row.querySelector('.service').value;
    clearTimeout(input.keyTimer);
    row.querySelector('.keyStatus').textContent=input.value.trim()?'Esperando para comprobar…':'';
    if(input.value.trim())input.keyTimer=setTimeout(function(){validateKeyInput(input,service);},650);
  });
  row.querySelector('.key').addEventListener('blur',function(){if(this.value.trim())validateKeyInput(this,row.querySelector('.service').value);});
  row.querySelector('.remove').addEventListener('click',function(){
    row.remove();
    if(backupReady) clearReview('Cambiaste opciones: revisa nuevamente el plan.');
  });
  sync();
}

function initAccess(){
  var el=document.getElementById('accessStatus');
  el.textContent='Acceso directo ✓';
  el.className='pill good';
  setBackupLocked(true);
  setSetupLocked(true);
}

function syncPelisAvailability(){
  var input=document.getElementById('esPelis');
  if(!input)return;
  var available=document.getElementById('tmdbMode').value==='personal'&&!!document.getElementById('tmdbKey').value.trim();
  input.disabled=isFreeMode()||!available;
  if(input.disabled){input.checked=false;delete input.dataset.freePrevious;}
  input.closest('.check').classList.toggle('freeUnavailable',input.disabled);
}

function syncMetadataModes(){
  ['tmdb','tvdb','rpdb'].forEach(function(service){
    var mode=document.getElementById(service+'Mode').value;
    document.getElementById(service+'Own').hidden=mode!=='personal';
  });
  syncPelisAvailability();
}
document.querySelectorAll('.metadataMode').forEach(function(select){
  select.addEventListener('change',syncMetadataModes);
});
syncMetadataModes();
['tmdb','tvdb','rpdb','mdblist'].forEach(function(service){
  var input=document.getElementById(service+'Key');
  input.addEventListener('input',function(){
    if(service==='tmdb')syncPelisAvailability();
    input.dataset.keyCheck='';input.dataset.checkedValue='';clearTimeout(input.keyTimer);
    document.getElementById(service+'KeyStatus').textContent=input.value.trim()?'Esperando para comprobar…':'';
    if(input.value.trim())input.keyTimer=setTimeout(function(){validateKeyInput(input,service);},650);
  });
  input.addEventListener('blur',function(){if(input.value.trim())validateKeyInput(input,service);});
});

function syncServiceSummary(){
  var parts=['accessStatus','wizardStatus','aioStatus','tamStatus'].map(function(id){return document.getElementById(id);});
  var pill=document.getElementById('serviceStatus');
  if(!pill)return;
  var bad=parts.some(function(el){return el&&/\bbad\b/.test(el.className);});
  var pending=parts.some(function(el){return el&&!/\b(good|bad)\b/.test(el.className);});
  pill.textContent=pending?'Comprobando servicios…':bad?'⚠ Algún servicio no responde':'✓ Servicios funcionando';
  pill.className='pill '+(pending?'':bad?'bad':'good');
  pill.title=parts.filter(Boolean).map(function(el){return el.textContent;}).join(' · ');
}

async function health(){
  try{
    var r=await fetch('/api/health',{cache:'no-store'});
    var d=await r.json();
    document.getElementById('wizardStatus').textContent='Wizard v'+d.wizard;
    document.getElementById('wizardStatus').className='pill good';
    var a=document.getElementById('aioStatus');
    a.textContent=d.aio&&d.aio.online?'AIOStreams destino '+d.aio.version+' · '+d.aio.channel:'AIOStreams destino offline';
    a.className=d.aio&&d.aio.online?'pill good':'pill bad';
    latestTamtaro=d.tamtaro||null;
    var t=document.getElementById('tamStatus');
    t.textContent=d.tamtaro?'Tamtaro '+d.tamtaro:'Tamtaro ?';
    t.className=d.tamtaro?'pill good':'pill bad';
    if(d.metadata){
      ['tmdb','tvdb'].forEach(function(service){
        var available=d.metadata[service]===true;
        var select=document.getElementById(service+'Mode');
        select.querySelector('option[value="instance"]').disabled=!available;
        if(!available&&select.value==='instance')select.value='personal';
      });
      syncMetadataModes();
      if(!d.metadata.tmdb||!d.metadata.tvdb)document.getElementById('metadataHint').textContent='La instancia no ofrece todas las claves compartidas ahora. Para los servicios no disponibles, usa una clave propia.';
    }
  }catch(e){
    document.getElementById('wizardStatus').textContent='Wizard sin conexión';
    document.getElementById('wizardStatus').className='pill bad';
  }
  syncServiceSummary();
}

document.getElementById('connectBtn').addEventListener('click',async function(){
  var btn=this,box=document.getElementById('accountResult'),auth=authPayload();
  if(!hasAuth(auth)){
    box.className='result note bad show';
    box.textContent='Ingresa tu correo y contraseña de '+platformName()+'.';
    return;
  }
  setBusy(btn,true,'Conectando…');
  try{
    var remember=auth.platform==='stremio'&&document.getElementById('rememberAccount').checked;
    var d=await post('/api/connect',Object.assign({},auth,{rememberOnDevice:remember}));
    var rememberNotice='';
    if(remember){
      try{await saveRememberedAccount(d.authKey,auth.email);}catch(_){rememberNotice='No se pudo guardar la cuenta en este navegador.';}
    }else if(auth.platform==='stremio')forgetRememberedAccount();
    connected=true;
    if(auth.platform==='nuvio'){
      var profileSelect=document.getElementById('profileId');
      profileSelect.innerHTML=(d.profiles||[]).map(function(p){
        return '<option value="'+Number(p.profile_index)+'">'+esc(p.name||p.profile_name||'Perfil '+p.profile_index)+'</option>';
      }).join('');
      profileSelect.value=String(d.profileId);
    }
    aioPushPlan=null;
    aioInstancePlan=null;
    document.getElementById('aioPushBtn').disabled=true;
    backupReady=false;
    preparedBackupId='';
    analysisDone=false;
    document.getElementById('nextBackup').hidden=true;
    setBackupLocked(false);
    setSetupLocked(true);
    document.getElementById('configureBtn').disabled=true;
    if(d.backups&&d.backups.length){
      lastBackupId=d.backups[0].id;
      document.getElementById('restoreBtn').style.display='inline-block';
    }else{
      document.getElementById('restoreBtn').style.display='none';
    }
    box.className='connectionFeedback show';
    box.setAttribute('role','status');
    box.textContent='✓ Cuenta conectada.';
    showInstalledAddons(d.addons);
    latestSourceFingerprint=d.sourceFingerprint||'';
    document.getElementById('nextAccount').hidden=false;
    document.getElementById('checkSetupBtn').hidden=!(d.addons&&d.addons.length);
    document.getElementById('accountHint').textContent=rememberNotice||'';
    restoringRemembered=false;
    maxWizardStep=2;
    showWizardStep(1);
  }catch(e){
    if(restoringRemembered){
      forgetRememberedAccount();
      document.getElementById('authKey').value='';
      restoringRemembered=false;
    }
    disconnectState('');
    box.className='result note bad show';
    box.textContent=e.message+' Si la sesión guardada venció, vuelve a conectar la cuenta.';
  }finally{setBusy(btn,false);}
});

document.getElementById('backupBtn').addEventListener('click',async function(){
  var btn=this,box=document.getElementById('backupStatus');
  if(!connected)return;
  setBusy(btn,true,'Creando y verificando…');
  try{
    var input=document.getElementById('aioBackupInput');
    var aioConfig=null;
    if(input.files&&input.files[0]){
      if(input.files[0].size>900000)throw new Error('La exportación AIOStreams supera 900 KB.');
      try{aioConfig=JSON.parse(await input.files[0].text());}
      catch(_){throw new Error('La exportación AIOStreams no es un JSON válido.');}
    }
    var mode=document.getElementById('aioInstallMode').value;
    var d=await post('/api/backup',Object.assign({},authPayload(),{aioConfig:aioConfig}));
    if(!d.verified)throw new Error('El servidor no confirmó la verificación');
    var partial=false;
    preparedBackupId=partial?'':d.backupId;
    lastBackupId=d.backupId;
    backupReady=!partial;
    installationComplete=false;
    analysisDone=false;
    aioInstancePlan=null;
    aioPushPlan=null;
    document.getElementById('aioPushBtn').disabled=true;
    document.getElementById('organizer').hidden=partial;
    if(!partial)renderOrganizer(true);
    setSetupLocked(partial);
    maxWizardStep=partial?2:3;
    showWizardStep(2);
    document.getElementById('nextBackup').hidden=partial;
    if(!partial){
      document.getElementById('backupBtn').className='secondary';
      document.getElementById('backupBtn').dataset.original='Rehacer respaldo';
      document.getElementById('backupBtn').textContent='Rehacer respaldo';
      document.querySelector('.backupCallout .section-kicker').textContent='RESPALDO VERIFICADO ✓';
      document.querySelector('.backupCallout p').textContent='Ya puedes pulsar «Continuar a preferencias» aquí mismo.';
      document.getElementById('backupIntro').textContent='Tus complementos y sus URL quedaron guardados y verificados. El AIOStreams anterior no se modificó.';
    }
    var notice=document.getElementById('backupNotice');
    notice.className='note'+(partial?' bad':' good');
    notice.textContent=partial?'Tu lista de complementos está respaldada. Para actualizar el AIOStreams existente, adjunta su exportación JSON y crea otra copia.':'Respaldo verificado. '+(mode==='new'?'Se instalará un AIOStreams nuevo y el anterior permanecerá intacto.':'Puedes continuar con tus preferencias.');
    document.getElementById('configureBtn').disabled=true;
    document.getElementById('restoreBtn').style.display='inline-block';
    var lines=[
      '✓ COPIA CREADA Y VERIFICADA',
      'Complementos protegidos: '+d.count,
      'AIOStreams anterior: '+(d.aio.needed?(d.aio.protected?'ajustes respaldados ('+(d.aio.source==='imported'?'exportación adjunta':'lectura de la instancia')+')':mode==='new'?'URL respaldada; ajustes internos no disponibles':'ajustes internos pendientes de respaldo'):'no hay AIOStreams instalado'),
      'Creado: '+new Date(d.createdAt).toLocaleString(),
      'Huella: '+d.fingerprint,
      '',
      'Se instalará un AIOStreams nuevo; el anterior no se modificará.'
    ];
    box.className='result note'+(partial?' bad':' good')+' show';
    box.innerHTML='<pre>'+esc(lines.join('\n'))+'</pre>'+
      '<div class="actions"><button class="secondary" id="downloadJsonBackup">Descargar copia JSON</button><span class="small">Guárdala en privado: puede contener URLs configuradas con tokens.</span></div>';
    var jsonBtn=document.getElementById('downloadJsonBackup');
    if(jsonBtn)jsonBtn.addEventListener('click',function(){
      var blob=new Blob([JSON.stringify(d.portable,null,2)],{type:'application/json'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=platformName().toLowerCase()+'-addons-config-'+new Date().toISOString().slice(0,19).replace(/:/g,'-')+'.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById('accountHint').textContent=partial?'El AIOStreams actual requiere la contraseña original o su exportación JSON para actualizarlo.':'Copia verificada ✓. Ya puedes configurar.';
  }catch(e){
    backupReady=false;
    preparedBackupId='';
    document.getElementById('nextBackup').hidden=true;
    document.getElementById('backupBtn').className='primary';
    document.getElementById('backupBtn').dataset.original='Crear respaldo seguro';
    document.querySelector('.backupCallout .section-kicker').textContent='RESPALDO PENDIENTE';
    document.querySelector('.backupCallout p').textContent='No se pudo crear el respaldo. Revisa el mensaje de error y vuelve a pulsar «Crear respaldo seguro».';
    syncAioInstallMode();
    setSetupLocked(true);
    box.className='result note bad show';
    box.textContent='No se habilitó la configuración: '+e.message;
  }finally{setBusy(btn,false);}
});

document.getElementById('restoreJsonBtn').addEventListener('click',function(){
  if(connected) document.getElementById('restoreJsonInput').click();
});

document.getElementById('restoreJsonInput').addEventListener('change',async function(){
  var file=this.files&&this.files[0];
  if(!file)return;
  var box=document.getElementById('backupStatus');
  try{
    var parsed=JSON.parse(await file.text());
    var addons=parsed&&parsed.result&&Array.isArray(parsed.result.addons)
      ?parsed.result.addons
      :(Array.isArray(parsed)?parsed:null);
    if(!addons)throw new Error('El archivo no tiene el formato de respaldo de Stremio/Bootstrapper.');
    if(!confirm('Esto reemplazará la colección actual por '+addons.length+' complementos del JSON. Antes se creará un respaldo de seguridad. ¿Continuar?'))return;
    var payload=Object.assign({},authPayload(),{addons:addons});
    var d=await post('/api/restore-json',payload);
    lastBackupId=d.safetyBackupId;
    document.getElementById('restoreBtn').style.display='inline-block';
    backupReady=false;
    preparedBackupId='';
    clearReview();
    setSetupLocked(true);
    resetWizardStep(2);
    document.getElementById('nextBackup').hidden=true;
    box.className='result note good show';
    box.textContent='✓ JSON restaurado ('+d.restored+' complementos). Se guardó un respaldo de seguridad del estado anterior. Crea ahora un respaldo seguro del estado restaurado para continuar.';
    try{showInstalledAddons((await post('/api/connect',authPayload())).addons);}catch(_){document.getElementById('installedAddons').className='result note';}
  }catch(e){
    box.className='result note bad show';
    box.textContent=e.message;
  }finally{
    this.value='';
  }
});

document.getElementById('restoreBtn').addEventListener('click',async function(){
  if(!connected||!lastBackupId)return;
  if(!confirm('¿Restaurar exactamente el respaldo anterior?'))return;
  var btn=this,box=document.getElementById('backupStatus');
  setBusy(btn,true,'Restaurando…');
  try{
    var payload=Object.assign({},authPayload(),{backupId:lastBackupId});
    var d=await post('/api/restore',payload);
    backupReady=false;
    preparedBackupId='';
    clearReview();
    setSetupLocked(true);
    resetWizardStep(2);
    document.getElementById('nextBackup').hidden=true;
    box.className='result note good show';
    box.textContent='✓ Colección '+platformName()+' restaurada ('+d.restored+' complementos). '+(d.aioConfig?'La configuración interna de AIOStreams está en la exportación descargable y debe importarse en AIOStreams. ':'El respaldo no contiene configuración interna de AIOStreams. ')+(d.collectionsRestored?'También se restauraron las colecciones de inicio de Nuvio. ':'')+'Crea un nuevo respaldo para continuar.';
    if(d.aioConfig){
      var a=document.createElement('button');a.className='secondary';a.textContent='Descargar configuración AIOStreams anterior';
      a.addEventListener('click',function(){downloadJsonFile('AIOStreams-config-restaurada.json',d.aioConfig);});
      box.appendChild(a);
    }
    try{showInstalledAddons((await post('/api/connect',authPayload())).addons);}catch(_){document.getElementById('installedAddons').className='result note';}
  }catch(e){
    box.className='result note bad show';
    box.textContent=e.message;
  }finally{setBusy(btn,false);}
});

document.getElementById('addDebridBtn').addEventListener('click',function(){
  addDebrid('premiumize');
  if(backupReady)clearReview('Cambiaste opciones: revisa nuevamente el plan.');
});
document.getElementById('withDebridBtn').addEventListener('click',function(){
  if(!isFreeMode())return;
  document.getElementById('debridMode').value='debrid';
  if(!document.querySelector('.debrid'))addDebrid('torbox');
  syncDebridMode(true);
});
document.getElementById('noDebridBtn').addEventListener('click',function(){
  if(isFreeMode())return;
  document.getElementById('debridMode').value='free';
  syncDebridMode(true);
});

document.addEventListener('click',function(e){
  var button=e.target.closest('button.selectGroup');
  if(!button)return;
  var group=document.getElementById(button.dataset.group);
  if(!group)return;
  var checked=button.dataset.checked==='true',seen=new Set(),changed=false;
  group.querySelectorAll('input[type="checkbox"]').forEach(function(input){
    if(input.disabled)return;
    var key=input.dataset.addonId;
    var next=checked&&(!key||!seen.has(key));
    if(key)seen.add(key);
    if(input.checked!==next){input.checked=next;changed=true;}
  });
  if(changed&&backupReady&&button.dataset.group!=='existingAddons')clearReview('Cambiaste opciones: revisa nuevamente el plan.');
});

document.querySelectorAll('.setupCard[data-step="3"], .setupCard[data-step="4"]').forEach(function(card){
  card.addEventListener('input',function(e){
    if(!backupReady||e.target.classList.contains('keepExisting'))return;
    clearReview('Cambiaste opciones: revisa nuevamente el plan.');
  });
  card.addEventListener('change',function(e){
    if(!backupReady||e.target.classList.contains('keepExisting'))return;
    clearReview('Cambiaste opciones: revisa nuevamente el plan.');
  });
});

['email','password','authKey'].forEach(function(id){
  document.getElementById(id).addEventListener('input',function(){
    if(id!=='authKey')document.getElementById('authKey').value='';
    if(connected)disconnectState('Cambiaste la autenticación. Conecta nuevamente la cuenta.');
  });
});

document.getElementById('reviewBtn').addEventListener('click',async function(){
  var btn=this,box=document.getElementById('analysisResult'),c=collect();
  var previous=document.getElementById('configureResult');
  previous.className='result note';
  previous.textContent='';
  if(!backupReady||!preparedBackupId){
    box.className='result note bad show';
    box.textContent='Primero crea y verifica el respaldo obligatorio.';
    return;
  }
  if(!c.noDebrid&&!c.debrids.length){
    box.className='result note bad show';
    box.textContent='Agrega al menos un Debrid con su API key o elige «No tengo Debrid».';
    return;
  }
  setBusy(btn,true,'Revisando…');
  try{
    if(!await checkEnteredKeys(3)||!await checkEnteredKeys(4))throw new Error('Corrige las claves marcadas antes de revisar el plan.');
    c.preparedBackupId=preparedBackupId;
    var d=await post('/api/analyze',c);
    var summary=['Complementos actuales: '+d.count];
    if(c.noDebrid)summary.push('Modo gratuito: AIOStreams usará fuentes HTTP/P2P compatibles y no configurará ningún servicio Debrid.');

    if(d.aio){
      if(d.aio.compatibleInstance){
        summary.push('AIOStreams detectado en '+(d.aio.host||'fortheweak.cloud'));
        if(d.aio.services&&d.aio.services.length)summary.push('Servicios AIOStreams actuales: '+d.aio.services.join(', '));
        if(d.aio.appliedTemplates&&d.aio.appliedTemplates.length){
          var tam=d.aio.appliedTemplates.find(function(x){return x.id==='tamtaro.complete';});
          if(tam&&latestTamtaro&&tam.version!==latestTamtaro)summary.push('⚠ Tamtaro '+tam.version+' → '+latestTamtaro);
          else if(tam&&latestTamtaro)summary.push('✓ Tamtaro '+tam.version+' actualizado');
        }
      }else{
        summary.push('AIOStreams detectado en otra instancia ('+(d.aio.host||'desconocida')+')');
        summary.push(c.aioInstallMode==='new'?'→ Se instalará otro AIOStreams en el servidor recomendado y la URL anterior quedará en el respaldo.':c.instanceMode==='keep'?'→ No se puede actualizar esta instancia desde el wizard. Elige cambiar.':'→ Se instalará en la instancia recomendada; la URL anterior quedará en el respaldo.');
      }
    }else{
      summary.push('AIOStreams no detectado → se creará uno nuevo.');
    }

    var fixed=d.plans.filter(function(p){return p.action!=='ask';});
    var asks=d.plans.filter(function(p){return p.action==='ask';});
    var additions=d.additions||[];
    if(d.aioPreview){
      aioInstancePlan=d.aioPreview.instance||null;
      if(d.aioPreview.instance){
        var ins=d.aioPreview.instance;
        summary.push(ins.changing?'Instancia AIOStreams: '+ins.from+' → '+ins.to+' (AIOStreams nuevo; el anterior no se modifica y su URL queda respaldada).':
          'Instancia AIOStreams: '+(ins.from||'sin AIOStreams instalado')+' → '+ins.to+(ins.from?' (se actualiza la instalación existente).':' (nueva instalación).'));
      }
      aioPushPlan=null;
      document.getElementById('aioPushBtn').disabled=true;
      summary.push('Perfil a aplicar: '+d.aioPreview.profile+' · Tamtaro '+d.aioPreview.templateVersion);
      summary.push('AIOStreams anterior: '+(d.aioPreview.previousProtected?'configuración interna respaldada':d.aioPreview.newInstallation?'queda intacto; su URL está respaldada, pero sus ajustes internos no están disponibles':'sin configuración interna respaldada'));
      if(d.aioPreview.changedFields)summary.push((d.aioPreview.newInstallation?'Diferencias con el AIOStreams anterior':'Campos AIOStreams que cambiarán')+' ('+d.aioPreview.changedFields.length+' mostrados): '+d.aioPreview.changedFields.join(', '));
      else if(d.aioPreview.newInstallation)summary.push('AIOStreams nuevo: se aplicará el perfil seleccionado desde cero.');
      else summary.push('Comparación detallada AIOStreams no disponible: adjunta su exportación en el respaldo.');
    }
    var html='<pre>'+esc(summary.join('\n'))+'</pre>';
    html+='<details class="fold" id="planDetails"><summary>Ver cambios automáticos ('+(additions.length+fixed.length)+')</summary>';

    additions.forEach(function(p){
      html+='<div class="check" style="margin:7px 0;align-items:flex-start"><div style="min-width:25px">＋</div><div><b>'+esc(p.name)+'</b> <span class="badge">AGREGAR</span><div class="small">'+esc(p.reason)+'</div></div></div>';
    });

    fixed.forEach(function(p){
      var action=p.action==='replace'?'REEMPLAZAR':'ELIMINAR';
      var icon=p.action==='replace'?'↻':'✕';
      html+='<div class="check" style="margin:7px 0;align-items:flex-start"><div style="min-width:25px">'+icon+'</div><div><b>'+esc(p.name)+'</b> <span class="badge">'+action+'</span> '+(p.duplicate?'<span class="rec-tag tag-redundant">ID REPETIDO</span>':'')+'<div class="small">'+esc(p.reason)+'</div></div></div>';
    });

    html+='</details>';
    if(asks.length){
      html+='<h3>Complementos actuales fuera del perfil: elige cuáles agregar</h3>';
      html+='<div class="small" style="margin-bottom:8px">La instalación parte con una lista limpia. Marca solamente los complementos actuales que quieras volver a agregar; conservarán su URL y configuración. Si hay variantes con el mismo ID, elige sólo una.</div>';
      html+='<div class="actions" style="margin:0 0 10px"><button class="secondary selectGroup" type="button" data-group="existingAddons" data-checked="true">Seleccionar todos</button><button class="secondary selectGroup" type="button" data-group="existingAddons" data-checked="false">Borrar selección</button></div><div id="existingAddons">';
      var seenAsk={};
      asks.forEach(function(p){
        var key=addonIdentity(p),duplicate=!!(key&&seenAsk[key]);
        if(key)seenAsk[key]=true;
        html+='<div class="check" style="margin:7px 0"><input class="keepExisting" type="checkbox" '+'value="'+(p.index-1)+'" data-addon-id="'+esc(key)+'"><label style="flex:1"><b>'+esc(p.name)+'</b> '+(duplicate?'<span class="rec-tag tag-redundant">ID REPETIDO · ELIGE UNO</span>':'<span class="rec-tag tag-rec">AGREGAR AL PERFIL</span>')+'<div class="small" style="overflow-wrap:anywhere">'+esc(p.url||'Sin URL')+'</div><div class="small">'+esc(p.reason)+'</div></label></div>';
      });
      html+='</div>';
    }

    analysisDone=true;
    document.getElementById('confirmPlanCheck').checked=false;
    document.getElementById('confirmPlanCheck').disabled=false;
    document.getElementById('confirmPlan').hidden=false;
    document.getElementById('configureBtn').disabled=true;
    box.className='result note good show';
    box.innerHTML=html;
    document.getElementById('workHint').textContent='Plan revisado. Puedes configurar cuando estés conforme.';
  }catch(e){
    analysisDone=false;
    document.getElementById('confirmPlan').hidden=true;
    document.getElementById('confirmPlanCheck').checked=false;
    aioPushPlan=null;
    aioInstancePlan=null;
    document.getElementById('aioPushBtn').disabled=true;
    document.getElementById('configureBtn').disabled=true;
    box.className='result note bad show';
    box.textContent=e.message;
  }finally{setBusy(btn,false);}
});

document.getElementById('analysisResult').addEventListener('change',function(e){
  if(!e.target.classList.contains('keepExisting')||!e.target.checked)return;
  var key=e.target.dataset.addonId;
  if(!key)return;
  this.querySelectorAll('.keepExisting').forEach(function(other){
    if(other!==e.target&&other.dataset.addonId===key)other.checked=false;
  });
});

document.getElementById('validateBtn').addEventListener('click',async function(){
  var urls=collect().customAddons,hint=document.getElementById('validateHint'),btn=this;
  if(!urls.length){hint.textContent='No hay URLs para validar.';return;}
  setBusy(btn,true,'Validando…');
  var out=[];
  for(var i=0;i<urls.length;i++){
    try{
      var d=await post('/api/validate-addon',{url:urls[i]});
      out.push('✓ '+d.name+' ('+d.id+')');
    }catch(e){out.push('✗ '+urls[i]+' — '+e.message);}
  }
  hint.textContent=out.join(' · ');
  setBusy(btn,false);
});

document.getElementById('aioPushBtn').addEventListener('click',async function(){
  var btn=this,box=document.getElementById('configureResult');
  if(!analysisDone||!backupReady||!preparedBackupId||!aioPushPlan||!document.getElementById('confirmPlanCheck').checked)return;
  var c=collect();
  c.preparedBackupId=preparedBackupId;
  c.expectedHash=aioPushPlan.expectedHash;
  c.proposedHash=aioPushPlan.proposedHash;
  if(!confirm('¿Actualizar la configuración completa de AIOStreams en '+aioPushPlan.host+'? Se guardará una copia antes del cambio. La URL y los demás complementos se conservarán.'))return;
  setBusy(btn,true,'Enviando configuración…');
  try{
    var d=await post('/api/aio-push',c);
    if(d.backupId)lastBackupId=d.backupId;
    box.className='result note good show';
    box.textContent=d.unchanged?'AIOStreams ya tiene este perfil; no hubo cambios.':
      'AIOStreams actualizado y verificado en '+d.host+'. La URL y la colección Stremio siguen iguales. '+
      (d.manifestChanged?'Cambió el manifiesto: actualiza o reinstala sólo AIOStreams en Stremio para que reconozca los nuevos catálogos o recursos.':'No cambió el manifiesto: no necesitas reinstalar.');
    clearReview('Push completado. Revisa nuevamente antes de enviar otros cambios.');
  }catch(e){box.className='result note bad show';box.textContent='No se pudo actualizar AIOStreams: '+e.message;}
  finally{setBusy(btn,false);}
});

function openCopyAccounts(){
  var dialog=document.getElementById('copyAccountsDialog');
  var content=document.getElementById('copyAccountsContent');
  content.textContent='';
  if(!connected||!latestSourceFingerprint){
    content.innerHTML='<div class="note"><b>Primero elige el origen.</b><p class="small">En el paso 1 conecta la cuenta de Stremio o Nuvio cuya configuración quieres copiar. Después vuelve aquí: el wizard detectará automáticamente el sentido de la copia y te pedirá la cuenta de destino.</p></div>';
  }else{
    offerSecondPlatform(authPayload(),latestSourceFingerprint,content);
  }
  if(!dialog.open)dialog.showModal();
}
document.getElementById('copyAccountsBtn').addEventListener('click',openCopyAccounts);
document.getElementById('closeCopyAccounts').addEventListener('click',function(){document.getElementById('copyAccountsDialog').close();});

function offerSecondPlatform(sourceAuth, sourceFingerprint, container) {
  var sourceName=sourceAuth.platform==='nuvio'?'Nuvio':'Stremio';
  var targetPlatform=sourceAuth.platform==='nuvio'?'stremio':'nuvio';
  var targetName=targetPlatform==='nuvio'?'Nuvio':'Stremio';
  var box=container||document.getElementById('copyAccountsContent');
  var panel=document.createElement('div');
  panel.className='note';
  panel.style.marginTop='18px';
  panel.innerHTML='<h3>Copiar '+sourceName+' → '+targetName+'</h3>'+
    '<p class="copyDirectionSummary"><b>Origen:</b> la cuenta de '+sourceName+' que ya conectaste. <b>Destino:</b> la cuenta de '+targetName+' que conectarás aquí. Al aplicar, la lista de complementos de '+targetName+' se reemplazará por una copia compatible de '+sourceName+'.</p>'+
    (targetPlatform==='nuvio'
      ?'<p class="small"><b>Adaptación para Nuvio:</b> Cinemeta y Streailer no se copian porque Nuvio no los utiliza. El resto, incluido AIOStreams, conserva sus mismas URL.</p>'
      :'<p class="small"><b>Adaptación para Stremio:</b> se copian los complementos de Nuvio y se conservan Cinemeta y Streailer si ya estaban instalados en Stremio.</p>')+
    '<div class="copySteps"><b>Cómo funciona</b><ol>'+
      '<li>Conecta tu cuenta de '+targetName+'.</li>'+
      '<li>El wizard crea y verifica un respaldo de '+targetName+' antes de modificarla.</li>'+
      '<li>Revisa el plan: elige si conservas complementos que sólo tiene el destino y, en Nuvio, si agregas sus extras.</li>'+
      '<li>Aplica la copia. '+sourceName+' permanece intacto y ambas apps usarán el mismo AIOStreams.</li>'+
    '</ol></div>'+
    '<button class="secondary" type="button" id="transferOpen">Preparar copia a '+targetName+'</button>'+
    '<div id="transferForm" hidden style="margin-top:14px">'+
      '<div class="row"><div class="field"><label for="transferEmail">Correo de '+targetName+'</label><input id="transferEmail" type="email" autocomplete="username"></div>'+
      '<div class="field"><label for="transferPassword">Contraseña de '+targetName+'</label><input id="transferPassword" type="password" autocomplete="current-password"></div></div>'+
      (targetPlatform==='nuvio'?'<div class="field" id="transferProfileField" hidden><label for="transferProfile">Perfil de Nuvio</label><select id="transferProfile"></select></div>':'')+
      '<div class="actions"><button class="secondary" type="button" id="transferConnect">Conectar cuenta de '+targetName+'</button>'+
      '<button class="secondary" type="button" id="transferCheck" disabled>Comparar con '+targetName+'</button><button class="secondary" type="button" id="transferPreview" disabled>Respaldar '+targetName+' y revisar</button></div>'+
      '<div id="transferStatus" class="small" role="status" style="margin-top:12px"></div>'+
      '<div id="transferPlan" hidden style="margin-top:12px"></div></div>';
  box.appendChild(panel);
  panel.querySelector('#transferOpen').hidden=true;
  panel.querySelector('#transferForm').hidden=false;
  var form=panel.querySelector('#transferForm'),status=panel.querySelector('#transferStatus');
  var connect=panel.querySelector('#transferConnect'),preview=panel.querySelector('#transferPreview'),check=panel.querySelector('#transferCheck');
  var plan=panel.querySelector('#transferPlan'), connectedTarget=null, transferBackup='';
  panel.querySelector('#transferOpen').addEventListener('click',function(){
    form.hidden=false;this.hidden=true;
  });
  function targetAuth(){
    return {platform:targetPlatform,
      email:panel.querySelector('#transferEmail').value.trim(),
      password:panel.querySelector('#transferPassword').value,
      authKey:'',
      profileId:targetPlatform==='nuvio'?Number(panel.querySelector('#transferProfile')?.value||0):0};
  }
  form.addEventListener('input',function(e){if(plan.contains(e.target))return;connectedTarget=null;transferBackup='';preview.disabled=true;check.disabled=true;plan.hidden=true;});
  form.addEventListener('change',function(e){if(plan.contains(e.target))return;transferBackup='';plan.hidden=true;});
  connect.addEventListener('click',async function(){
    var auth=targetAuth();
    if(!hasAuth(auth)){status.textContent='Ingresa el acceso de '+targetName+'.';return;}
    setBusy(connect,true,'Conectando⬦');
    try{
      var result=await post('/api/connect',auth);
      if(targetPlatform==='nuvio'){
        var select=panel.querySelector('#transferProfile');
        select.textContent='';
        (result.profiles||[]).forEach(function(p){
          var option=document.createElement('option');
          option.value=p.profile_index;
          option.textContent=p.name||p.profile_name||('Perfil '+p.profile_index);
          if(Number(p.profile_index)===Number(result.profileId))option.selected=true;
          select.appendChild(option);
        });
        panel.querySelector('#transferProfileField').hidden=false;
      }
      connectedTarget=targetAuth();
      preview.disabled=false;check.disabled=false;
      status.textContent=targetName+' conectado. Ahora respalda '+targetName+' y revisa exactamente qué se copiará desde '+sourceName+'.';
    }catch(error){status.textContent='No se pudo conectar: '+error.message;}
    finally{setBusy(connect,false);}
  });
  check.addEventListener('click',async function(){
    if(!connectedTarget)return;
    setBusy(check,true,'Comprobando…');
    try {
      var result=await post('/api/transfer-check',{source:sourceAuth,sourceFingerprint:sourceFingerprint,target:targetAuth()});
      status.textContent=result.matches&&result.sameAio
        ? 'Verificado: '+targetName+' ya tiene los '+result.actualCount+' complementos esperados y usa el mismo AIOStreams.'
        : 'Aún no coincide: '+targetName+' tiene '+result.actualCount+' complementos; se esperan '+result.proposedCount+'. Puedes respaldar y revisar antes de aplicar.';
    } catch(error){status.textContent='No se pudo comprobar: '+error.message;}
    finally{setBusy(check,false);}
  });
  preview.addEventListener('click',async function(){
    if(!connectedTarget)return;
    var target=targetAuth();
    setBusy(preview,true,'Respaldando⬦');
    try{
      var result=await post('/api/transfer-preview',{source:sourceAuth,sourceFingerprint:sourceFingerprint,target:target});
      transferBackup=result.backupId;
      plan.hidden=false;
      var tmdbForm=document.getElementById('tmdbMode').value==='personal'?document.getElementById('tmdbKey').value.trim():'';
      var extras=(result.targetOnly||[]);
      plan.innerHTML='<div class="note"><b>Respaldo de '+targetName+' creado y verificado.</b><p>Al aplicar, '+targetName+' reemplazará su lista actual ('+
        result.previous.length+' complementos) por '+result.count+
        ' complementos copiados desde '+sourceName+'. Se reutilizará exactamente la misma instancia de AIOStreams.</p>'+
        '<p class="small">'+sourceName+' no se modificará.</p>'+
        (extras.length?'<div class="transferExtras"><b>Complementos que sólo tiene '+targetName+'</b><div class="small">Por defecto se quitan para que '+targetName+' quede igual a '+sourceName+'. Marca los que quieras conservar.</div><div class="checks">'+
          extras.map(function(a,i){return '<div class="check"><input class="keepTarget" type="checkbox" id="keepT'+i+'" value="'+esc(a.url)+'"><label for="keepT'+i+'"><b>'+esc(a.name)+'</b></label></div>';}).join('')+'</div></div>':'')+
        (targetPlatform==='nuvio'?'<div class="transferExtras"><b>Extras de Nuvio (opcional)</b><div class="checks">'+
          '<div class="check"><input id="transferCollections" type="checkbox" checked><label for="transferCollections"><b>Colecciones de inicio</b><div class="small">Filas Ver ahora, Géneros, Décadas, Temáticas e Internacional. Reemplaza las colecciones actuales del perfil; quedan en el respaldo.</div></label></div>'+
          (tmdbForm?'<div class="check"><input id="transferFranchises" type="checkbox" checked><label for="transferFranchises"><b>Franquicias</b><div class="small">Fila con sagas como Star Wars o Marvel, usando tu clave de TMDB.</div></label></div>':'')+
          '</div></div>':'')+
        '<button class="primary" type="button" id="transferApply">Copiar '+sourceName+' → '+targetName+'</button></div>';
      status.textContent='Revisa el cambio antes de aplicarlo. Sólo se modificará '+targetName+'; '+sourceName+' permanecerá intacto.';
      plan.querySelector('#transferApply').addEventListener('click',async function(){
        if(!confirm('¿Copiar la configuración de '+sourceName+' a '+targetName+'? Se reemplazará la lista de '+targetName+'; su respaldo ya está guardado y '+sourceName+' no se modificará.'))return;
        var button=this;
        setBusy(button,true,'Instalando⬦');
        try{
          var applied=await post('/api/transfer-apply',{source:sourceAuth,sourceFingerprint:sourceFingerprint,
            target:targetAuth(),backupId:transferBackup,
            keepTargetUrls:Array.from(plan.querySelectorAll('.keepTarget:checked')).map(function(x){return x.value;}),
            includeCollections:!!(plan.querySelector('#transferCollections')&&plan.querySelector('#transferCollections').checked),
            includeFranchises:!!(plan.querySelector('#transferFranchises')&&plan.querySelector('#transferFranchises').checked),
            tmdbKey:tmdbForm,
            language:document.getElementById('language').value});
          form.querySelector('.row').hidden=true;
          if(panel.querySelector('#transferProfileField'))panel.querySelector('#transferProfileField').hidden=true;
          form.querySelector('.actions').hidden=true;
          plan.hidden=true;
          status.textContent='Copia completada: '+sourceName+' → '+targetName+'. '+targetName+' tiene '+applied.total+
            ' complementos verificados y utiliza el mismo AIOStreams. '+sourceName+' quedó intacto. Respaldo de '+targetName+': '+(applied.backupLabel||'guardado en este navegador')+'.';
          if(applied.collections&&applied.collections.applied){
            var collectionsNote=document.createElement('div');collectionsNote.className='small';
            collectionsNote.textContent='También se agregaron las colecciones de inicio de Nuvio.';
            panel.appendChild(collectionsNote);
          }
          var download=document.createElement('button');
          download.className='secondary';
          download.type='button';
          download.style.marginTop='10px';
          download.textContent='Descargar lista de '+targetName;
          download.addEventListener('click',function(){downloadJsonFile(targetName+'-complementos.json',applied.addons);});
          panel.appendChild(download);
        }catch(error){status.textContent='No se completó la instalación en '+targetName+': '+error.message;}
        finally{setBusy(button,false);}
      });
    }catch(error){status.textContent='No se pudo preparar '+targetName+' para recibir la copia: '+error.message;}
    finally{setBusy(preview,false);}
  });
}
document.getElementById('configureBtn').addEventListener('click',async function(){
  var btn=this,box=document.getElementById('configureResult'),c=collect();
  if(!backupReady||!preparedBackupId){
    box.className='result note bad show';
    box.textContent='Respaldo no válido. Crea uno nuevo antes de configurar.';
    return;
  }
  if(!analysisDone||!document.getElementById('confirmPlanCheck').checked){
    box.className='result note bad show';
    box.textContent='Primero revisa el plan final.';
    return;
  }
  c.preparedBackupId=preparedBackupId;
  if(!confirm(aioInstancePlan&&aioInstancePlan.changing
    ?'¿Cambiar AIOStreams de '+aioInstancePlan.from+' a '+aioInstancePlan.to+' y aplicar el plan? El respaldo conservará la instalación anterior.'
    :'Respaldo verificado y plan revisado. ¿Aplicar la configuración a '+platformName()+'?'))return;
  box.className='result note';
  box.textContent='';
  setBusy(btn,true,'Configurando…');
  document.getElementById('workHint').textContent='Aplicando cambios. No cierres esta pestaña.';
  try{
    var d=await post('/api/configure',c);
    lastBackupId=d.backupId;
    lastRecovery=d.aio&&d.aio.recovery;
    showInstalledAddons(d.addons);
    document.getElementById('restoreBtn').style.display='inline-block';

    var details=[
      'Copia de seguridad: '+(d.backupLabel||'guardada en este navegador'),
      d.collections?(d.collections.applied?'Colecciones de inicio de Nuvio: '+d.collections.count+' agregadas':'Colecciones de inicio de Nuvio: no se pudieron agregar'):'Colecciones de inicio de Nuvio: no aplica',
      'AIOStreams: '+(c.profileMode==='tamtaro'?'configuración predeterminada de Tamtaro':'configuración recomendada')+' · Tamtaro '+d.aio.templateVersion,
      'Verificación '+platformName()+': '+(d.verification&&d.verification.collection?'correcta':'no confirmada'),
      'AIOStreams: '+(d.verification&&d.verification.aioOnline?'en línea':'sin respuesta'),
      'AIOMetadata: '+(d.verification&&d.verification.metadataOnline?'en línea':'sin respuesta')].concat(
      d.skippedAddons&&d.skippedAddons.length?['Omitidos porque no respondieron: '+d.skippedAddons.join(', ')]:[]
    );
    var recoveryHtml='';
    if(lastRecovery){
      recoveryHtml='<div class="aioCredentialsCard" aria-label="Credenciales de AIOStreams">'+
        '<h3>Guarda esta clave para editar AIOStreams</h3>'+
        '<p>Estas son las credenciales de administración del AIOStreams que acaba de crear el wizard. Las necesitarás para volver a entrar y cambiar su configuración más adelante.</p>'+
        '<div class="credentialGrid">'+
          '<div class="credentialBox"><span class="small">UUID de AIOStreams</span><code class="credentialValue">'+esc(lastRecovery.uuid)+'</code></div>'+
          '<div class="credentialBox"><span class="small">Clave de edición / contraseña</span><code class="credentialValue">'+esc(lastRecovery.password)+'</code></div>'+
        '</div>'+
        '<div class="credentialActions">'+
          '<button class="secondary" id="copyAioUuid" type="button">Copiar UUID</button>'+
          '<button class="secondary" id="copyAioPassword" type="button">Copiar clave</button>'+
          '<button class="secondary" id="copyAioCredentials" type="button">Copiar ambos</button>'+
          (window.PasswordCredential&&navigator.credentials?'<button class="primary" id="storeAioCredentials" type="button">Guardar en el navegador</button>':'')+
          '<button class="secondary" id="exportAioCsv" type="button">Descargar para gestor de contraseñas</button>'+
        '</div>'+
        '<p class="small" id="aioSaveHint" hidden></p>'+
        '<div class="credentialWarning"><b>Importante:</b> el wizard no guarda esta contraseña en el servidor ni en sus respaldos. Se mantiene sólo durante esta sesión y en el JSON que descargues. <b>Antes de cerrar o recargar esta página, guárdala en un gestor de contraseñas o en otro lugar seguro.</b></div>'+
      '</div>';
    }
    box.className='result note good show';
    box.innerHTML='<div class="successBanner" role="status"><div class="successIcon" aria-hidden="true">✓</div><div><h2>¡Lo lograste! '+platformName()+' está configurado</h2><p>Se instalaron '+d.total+' complementos: '+d.managed+' configurados por el wizard y '+d.preserved+' conservados. La colección quedó verificada en tu cuenta.</p></div></div>'+
      recoveryHtml+
      '<div class="note howToCheck"><b>Cómo comprobar que funciona:</b> abre '+platformName()+' (si ya estaba abierto, ciérralo y vuelve a abrirlo), busca una película conocida y entra a su ficha. Deberían aparecer enlaces de AIOStreams en la lista de fuentes. Si no aparece nada, espera un minuto y vuelve a intentar.'+
        (d.collections&&d.collections.applied?' En Nuvio verás además nuevas filas en el inicio: Ver ahora, Géneros, Décadas y más.':'')+'</div>'+
      '<div class="note supportNote"><b>☕ ¿Te ahorró tiempo?</b> El wizard es gratis y lo mantengo: arreglo los complementos que se caen y pruebo nuevos. Si quieres apoyarlo: '+
        '<a class="link" href="https://ko-fi.com/supermaniac" target="_blank" rel="noopener noreferrer">Ko-fi</a> · '+
        '<a class="link" href="https://github.com/sponsors/maniac75" target="_blank" rel="noopener noreferrer">GitHub Sponsors</a></div>'+
      (d.platform==='nuvio'&&Array.isArray(d.profiles)&&d.profiles.length>1?
        '<div class="note nuvioProfiles"><b>¿Tienes más perfiles en Nuvio?</b><div class="small">Copia esta misma configuración a otros perfiles de la cuenta. Antes de cambiar cada perfil, el wizard guarda su respaldo.</div>'+
        '<div class="checks">'+d.profiles.filter(function(p){return p.id!==d.profileId;}).map(function(p){
          return '<div class="check"><input class="nuvioProfileTarget" type="checkbox" value="'+Number(p.id)+'" id="np'+Number(p.id)+'"><label for="np'+Number(p.id)+'"><b>'+esc(p.name)+'</b></label></div>';
        }).join('')+'</div>'+
        '<div class="actions"><button class="primary" id="applyOtherProfiles" type="button">Aplicar a los perfiles marcados</button></div><div class="small" id="otherProfilesStatus"></div></div>':'')+
      watchlyResultHtml(d)+
      '<details class="fold customize" id="customizeFold"><summary>Personaliza tu inicio: orden y catálogos</summary>'+
        '<div class="small" style="margin:8px 0">'+(d.platform==='nuvio'
          ?'Sube o baja complementos: el orden define qué filas y fuentes aparecen primero. En Nuvio, los catálogos de cada complemento se eligen dentro de la app.'
          :'Sube o baja complementos para cambiar el orden de las filas del inicio. Desmarca los catálogos que no quieras ver o cámbiales el nombre.')+
        ' Antes de guardar se crea un respaldo de seguridad.</div>'+
        '<div id="customizeList"></div>'+
        '<div class="actions"><button class="primary" id="customizeSave" type="button">Guardar orden y catálogos</button></div>'+
        '<div class="small" id="customizeResult"></div></details>'+
      traktGuideHtml(d.platform,!!(d.watchly&&(d.watchly.installed||d.watchly.reused)))+
      '<details class="fold"><summary>Ver detalles de la instalación</summary><pre>'+esc(details.join('\n'))+'</pre></details>'+
      '<div class="actions">'+(lastRecovery?'<button class="secondary" id="downloadRecovery" type="button">Descargar JSON con credenciales AIOStreams</button>':'')+
      '<button class="secondary" id="downloadInstalledAfter" type="button">Descargar lista y URL de complementos</button>'+
      '<button class="secondary" id="showInstalledAfter" type="button">Ver complementos instalados</button>'+
       '<button class="primary" id="copyAfterSuccess" type="button">Copiar a la otra cuenta</button></div>'+
      (lastRecovery?'<p class="small">El JSON contiene otra copia del UUID, la clave de edición y la URL de instalación de AIOStreams. Guárdalo también en privado. El respaldo de '+platformName()+' permite restaurar la colección anterior, pero <b>no guarda esta clave de AIOStreams</b>.</p>':'<p class="small">Guarda la lista de URL para reinstalar los complementos más adelante. El respaldo de '+platformName()+' permite restaurar la colección anterior.</p>');

    var otherProfilesButton=document.getElementById('applyOtherProfiles');
    if(otherProfilesButton)otherProfilesButton.addEventListener('click',async function(){
      var targets=Array.from(document.querySelectorAll('.nuvioProfileTarget:checked')).map(function(x){return Number(x.value);});
      var status=document.getElementById('otherProfilesStatus');
      if(!targets.length){status.textContent='Marca al menos un perfil.';return;}
      if(!confirm('¿Copiar la configuración de este perfil a '+targets.length+' perfil(es)? Sus complementos actuales se reemplazarán; cada uno queda respaldado antes del cambio.'))return;
      setBusy(otherProfilesButton,true,'Aplicando…');
      try{
        var r=await post('/api/nuvio-apply-profiles',Object.assign({},authPayload(),{targetProfiles:targets,includeCollections:true}));
        status.innerHTML=r.results.map(function(x){
          return x.ok?'✓ '+esc(x.name)+': '+x.total+' complementos'+(x.collections?' y colecciones':'')+'.':'✗ '+esc(x.name)+': '+esc(x.error);
        }).join('<br>');
      }catch(e){status.textContent='No se pudo aplicar: '+e.message;}
      finally{setBusy(otherProfilesButton,false);}
    });

    if(lastRecovery){
      var uuidButton=document.getElementById('copyAioUuid');
      var passwordButton=document.getElementById('copyAioPassword');
      var bothButton=document.getElementById('copyAioCredentials');
      if(uuidButton)uuidButton.addEventListener('click',function(){copyTextValue(lastRecovery.uuid,uuidButton,'UUID copiado ✓');});
      if(passwordButton)passwordButton.addEventListener('click',function(){copyTextValue(lastRecovery.password,passwordButton,'Clave copiada ✓');});
      if(bothButton)bothButton.addEventListener('click',function(){
        copyTextValue('AIOStreams\nUUID: '+lastRecovery.uuid+'\nClave de edición: '+lastRecovery.password,bothButton,'Credenciales copiadas ✓');
      });
      var aioOrigin='';
      try{aioOrigin=new URL(lastRecovery.manifestUrl).origin;}catch(_){}
      var saveHint=document.getElementById('aioSaveHint');
      var storeButton=document.getElementById('storeAioCredentials');
      if(storeButton)storeButton.addEventListener('click',async function(){
        try{
          // Chrome/Edge: abre el aviso nativo "¿Guardar contraseña?" del navegador.
          await navigator.credentials.store(new PasswordCredential({id:lastRecovery.uuid,password:lastRecovery.password,
            name:'AIOStreams'+(aioOrigin?' ('+new URL(aioOrigin).hostname+')':'')}));
          storeButton.textContent='Guardado en el navegador ✓';
          saveHint.hidden=false;
          saveHint.textContent='Queda guardado para este sitio. Búscalo como «AIOStreams» en el gestor de contraseñas del navegador.';
        }catch(_){
          saveHint.hidden=false;
          saveHint.textContent='El navegador no permitió guardarlo. Usa «Descargar para gestor de contraseñas» o cópialo a mano.';
        }
      });
      var csvButton=document.getElementById('exportAioCsv');
      if(csvButton)csvButton.addEventListener('click',function(){
        // Formato CSV de Chrome: lo importan Contraseñas de Apple, Chrome, Edge, 1Password y Bitwarden.
        var cell=function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';};
        var csv='name,url,username,password,note\r\n'+[
          'AIOStreams',aioOrigin||'',lastRecovery.uuid,lastRecovery.password,
          'Creado con Stremio & Nuvio Wizard el '+new Date().toISOString().slice(0,10)
        ].map(cell).join(',')+'\r\n';
        var blob=new Blob([csv],{type:'text/csv'});
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='AIOStreams-para-importar.csv';a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
        saveHint.hidden=false;
        saveHint.innerHTML='<b>Importa el archivo en tu gestor y luego bórralo</b>: contiene la clave sin cifrar. En Mac: app Contraseñas › Archivo › Importar contraseñas.';
      });
    }

    var dl=document.getElementById('downloadRecovery');
    if(dl)dl.addEventListener('click',function(){
      var blob=new Blob([JSON.stringify(lastRecovery,null,2)],{type:'application/json'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='AIOStreams-recovery.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('downloadInstalledAfter').addEventListener('click',downloadInstalledList);
    latestSourceFingerprint=d.sourceFingerprint||'';
    startCustomizer(d.addons,d.platform);
    var copyAfter=document.getElementById('copyAfterSuccess');
    if(copyAfter)copyAfter.addEventListener('click',openCopyAccounts);
    document.getElementById('showInstalledAfter').addEventListener('click',function(){showWizardStep(2);});
    backupReady=false;
    preparedBackupId='';
    clearReview();
    document.getElementById('organizer').hidden=true;
    setSetupLocked(true);
    installationComplete=true;
    document.getElementById('applyCard').classList.remove('locked');
    showWizardStep(5);
    document.getElementById('accountHint').textContent='Configuración aplicada. Tu respaldo anterior sigue disponible para restaurar.';
    box.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){
    document.getElementById('configureBtn').disabled=true;
    analysisDone=false;
    box.className='result note bad show';
    box.textContent='No se aplicó completamente: '+e.message+'. El respaldo verificado sigue disponible.';
  }finally{
    setBusy(btn,false);
    document.getElementById('workHint').textContent='';
  }
});

document.getElementById('forgetAccount').addEventListener('click',function(){
  forgetRememberedAccount();
  ['email','password','authKey'].forEach(function(id){document.getElementById(id).value='';});
  disconnectState('Cuenta olvidada en este navegador. Puedes conectarte con otra cuenta.');
  document.getElementById('accountResult').className='result note';
  document.getElementById('accountResult').textContent='';
});
document.getElementById('rememberAccount').addEventListener('change',function(){
  if(!this.checked)forgetRememberedAccount();
});
document.getElementById('organizerList').addEventListener('change',function(e){
  if(!e.target.classList.contains('organizerCatalog'))return;
  var index=Number(e.target.dataset.index),key=e.target.dataset.key;
  var selected=new Set(organizerCatalogs[index]||[]);
  if(e.target.checked)selected.add(key);else selected.delete(key);
  organizerCatalogs[index]=Array.from(selected);
});
document.getElementById('organizerList').addEventListener('click',function(e){
  var btn=e.target.closest('.orderMove');if(!btn)return;
  var from=Number(btn.dataset.position),to=from+Number(btn.dataset.dir);
  if(to<0||to>=organizerOrder.length)return;
  var moved=organizerOrder.splice(from,1)[0];organizerOrder.splice(to,0,moved);
  renderOrganizer(false);
});
document.getElementById('organizeBtn').addEventListener('click',async function(){
  if(!backupReady||!preparedBackupId)return;
  if(!confirm('¿Guardar el nuevo orden y los catálogos seleccionados en '+platformName()+'? El respaldo permite deshacerlo.'))return;
  var btn=this,box=document.getElementById('organizeResult');
  setBusy(btn,true,'Guardando…');
  try{
    var d=await post('/api/organize',Object.assign({},authPayload(),{
      preparedBackupId:preparedBackupId,order:organizerOrder,catalogChoices:organizerCatalogs
    }));
    showInstalledAddons(d.addons);
    backupReady=false;preparedBackupId='';clearReview('El orden cambió. Crea un nuevo respaldo antes de configurar.');
    setSetupLocked(true);
    resetWizardStep(2);
    document.getElementById('nextBackup').hidden=true;
    document.getElementById('organizer').hidden=true;
    box.className='result note good show';
    box.textContent='Orden y catálogos verificados. Crea un respaldo nuevo para seguir.';
    document.getElementById('backupStatus').className='result note';
  }catch(e){box.className='result note bad show';box.textContent=e.message;}
  finally{setBusy(btn,false);}
});
document.getElementById('exportProfile').addEventListener('click',exportWizardProfile);
document.getElementById('importProfile').addEventListener('click',function(){document.getElementById('profileInput').click();});
document.getElementById('profileInput').addEventListener('change',async function(){
  var file=this.files&&this.files[0];if(!file)return;
  try{
    if(file.size>100000)throw new Error('El archivo de perfil es demasiado grande.');
    var p=JSON.parse(await file.text());
    if(p.format!=='stremio-wizard-profile-v1')throw new Error('Formato de perfil no reconocido.');
    ['language','profileMode','instanceMode','tmdbMode','tvdbMode','rpdbMode'].forEach(function(id){
      if(p[id]&&Array.from(document.getElementById(id).options).some(function(x){return x.value===p[id];}))
        document.getElementById(id).value=p[id];
    });
    setLanguageOrder(p.audioLanguages,p.subtitleLanguages);
    ['kids','anime','no4k','cachedOnly','removeWatchHub','trailers','subtitles','openSubtitles','stores','watchly'].forEach(function(id){
      if(typeof p[id]==='boolean')document.getElementById(id).checked=p[id];
    });
    document.querySelectorAll('.standaloneAddon').forEach(function(x){x.checked=Array.isArray(p.standaloneAddons)&&p.standaloneAddons.includes(x.value);});
    document.getElementById('debridList').textContent='';
    var selected=Array.isArray(p.debridServices)?p.debridServices.filter(function(x){return !!serviceNames[x];}):[];
    if(p.noDebrid!==true)(selected.length?selected:['torbox']).forEach(addDebrid);
    document.getElementById('debridMode').value=p.noDebrid===true?'free':'debrid';
    syncDebridMode(false);
    syncMetadataModes();
    if(backupReady)clearReview('Perfil importado. Revisa nuevamente el plan.');
    alert(isFreeMode()?'Perfil importado en modo gratuito. Revisa tus opciones y URLs personales antes de continuar.':'Perfil importado. Ingresa tus claves Debrid y URLs personales antes de revisar.');
  }catch(e){alert('No se pudo importar: '+e.message);}
  finally{this.value='';}
});
document.getElementById('nextAccount').addEventListener('click',function(){if(connected)advanceWizardStep(2);});

// Revisar mi configuración: detecta complementos caídos o retirados y permite quitarlos con respaldo.
document.getElementById('checkSetupBtn').addEventListener('click',async function(){
  var btn=this, box=document.getElementById('checkSetupResult');
  setBusy(btn,true,'Revisando…');
  box.className='result note show';box.textContent='Revisando cada complemento instalado…';
  try{
    var d=await post('/api/check-setup',authPayload());
    var problems=d.results.filter(function(r){return r.status==='down'||r.status==='retired';});
    var okCount=d.counts.ok||0;
    var html='<b>Revisión de '+d.total+' complementos:</b> '+okCount+' responden bien'+
      (problems.length?', '+problems.length+' con problemas.':'.')+
      (d.checked<d.total?'<div class="small">Se revisaron los primeros '+d.checked+'.</div>':'');
    if(problems.length){
      html+='<div class="checks" style="margin-top:10px">'+problems.map(function(r,i){
        var why=r.status==='retired'?'Retirado: ya no se mantiene.':'No responde'+(r.detail?' ('+esc(r.detail)+')':'')+'.';
        return '<div class="check"><input class="removeAddon" type="checkbox" checked id="rmA'+i+'" value="'+esc(r.url)+'"><label for="rmA'+i+'"><b>'+esc(r.name)+'</b><div class="small">'+why+'</div></label></div>';
      }).join('')+'</div>'+
      '<div class="actions"><button class="primary" id="removeAddonsBtn" type="button">Quitar los marcados (con respaldo)</button></div>'+
      '<div class="small">Si un complemento no responde, puede ser una caída temporal. Si es uno que instaló el wizard, al terminar el wizard se vuelve a instalar con la configuración actual.</div>';
    }else{
      html+='<div class="small">✓ No hay complementos caídos ni retirados. Si quieres la configuración más reciente del wizard, continúa al respaldo y vuelve a aplicar.</div>';
    }
    if(!d.hasAio)html+='<div class="small">Esta cuenta no tiene AIOStreams: el wizard te lo puede instalar.</div>';
    box.className='result note show '+(problems.length?'warn':'good');
    box.innerHTML=html;
    var rm=document.getElementById('removeAddonsBtn');
    if(rm)rm.addEventListener('click',async function(){
      var urls=Array.from(box.querySelectorAll('.removeAddon:checked')).map(function(x){return x.value;});
      if(!urls.length){alert('Marca al menos un complemento.');return;}
      if(!confirm('¿Quitar '+urls.length+' complemento(s) de tu cuenta? Antes se guarda un respaldo para poder volver atrás.'))return;
      setBusy(rm,true,'Quitando…');
      try{
        var r=await post('/api/remove-addons',Object.assign({},authPayload(),{removeUrls:urls,sourceFingerprint:d.sourceFingerprint}));
        box.className='result note show good';
        box.innerHTML='✓ Se quitaron: '+r.removed.map(esc).join(', ')+'. Tu cuenta queda con '+r.total+' complementos. Respaldo: '+esc(r.backupLabel||'guardado en este navegador')+'.';
      }catch(e){box.className='result note show bad';box.textContent='No se pudieron quitar: '+e.message;}
      finally{setBusy(rm,false);}
    });
  }catch(e){box.className='result note show bad';box.textContent='No se pudo revisar: '+e.message;}
  finally{setBusy(btn,false);}
});
document.getElementById('nextBackup').addEventListener('click',function(){if(backupReady)advanceWizardStep(3);});
document.getElementById('confirmPlanCheck').addEventListener('change',function(){
  document.getElementById('configureBtn').disabled=!(analysisDone&&this.checked);
  document.getElementById('aioPushBtn').disabled=!(analysisDone&&this.checked&&aioPushPlan);
});
document.querySelectorAll('[data-goto]').forEach(function(btn){
  btn.addEventListener('click',function(){var n=Number(btn.dataset.goto);if(n<=currentWizardStep||installationComplete&&n===5)showWizardStep(n);});
});
document.getElementById('nextPreferences').addEventListener('click',async function(){
  var hint=document.getElementById('preferencesHint');
  if(isFreeMode()){
    hint.textContent='Modo gratuito activo: se usarán fuentes HTTP/P2P compatibles.';
    advanceWizardStep(4);
    return;
  }
  var entries=Array.from(document.querySelectorAll('.debrid')).map(function(row){
    return {service:row.querySelector('.service').value,key:row.querySelector('.key').value.trim()};
  });
  var filled=entries.filter(function(entry){return !!entry.key;});
  if(!filled.length){hint.textContent='Ingresa la API key de tu servicio Debrid o elige «No tengo Debrid».';document.querySelector('.debrid .key')?.focus();return;}
  if(filled.length!==entries.length){hint.textContent='Completa o elimina las filas Debrid sin API key.';return;}
  if(new Set(filled.map(function(entry){return entry.service;})).size!==filled.length){hint.textContent='Hay servicios Debrid repetidos. Conserva una sola fila por servicio.';return;}
  hint.textContent='Comprobando las claves Debrid…';
  if(!await checkEnteredKeys(3)){hint.textContent='Corrige la clave indicada antes de continuar.';return;}
  hint.textContent='';advanceWizardStep(4);
});
document.getElementById('nextAddons').addEventListener('click',function(){
  if(!backupReady)return;
  advanceWizardStep(5);
  document.getElementById('reviewBtn').click();
});
function floatingAction(){
  var id;
  if(currentWizardStep===1)id=connected?'nextAccount':'connectBtn';
  else if(currentWizardStep===2)id=backupReady?'nextBackup':'backupBtn';
  else if(currentWizardStep===3)id='nextPreferences';
  else if(currentWizardStep===4)id='nextAddons';
  else if(currentWizardStep===5){
    if(installationComplete)id=lastRecovery?'downloadRecovery':'downloadInstalledAfter';
    else if(!analysisDone)id='reviewBtn';
    else if(!document.getElementById('confirmPlanCheck').checked)id='confirmPlanCheck';
    else id='configureBtn';
  }
  return id?document.getElementById(id):null;
}
function syncFloatingNext(){
  var floating=document.getElementById('floatingNext'),target=floatingAction();
  if(!target){floating.hidden=true;return;}
  floating.hidden=false;
  floating.disabled=target.disabled;
  floating.textContent=target.id==='confirmPlanCheck'?'Confirmar plan para aplicar':target.textContent.trim();
  floating.setAttribute('aria-label',floating.textContent);
}
document.getElementById('floatingNext').addEventListener('click',function(){
  var target=floatingAction();
  if(!target||target.disabled)return;
  if(target.id==='confirmPlanCheck'){
    target.scrollIntoView({behavior:'smooth',block:'center'});
    target.focus();
  }else target.click();
});
document.addEventListener('input',syncFloatingNext);
document.addEventListener('change',function(){setTimeout(syncFloatingNext,0);});
new MutationObserver(syncFloatingNext).observe(document.querySelector('.grid'),{
  subtree:true,attributes:true,attributeFilter:['hidden','disabled']
});

// ---- Idiomas de audio y subtítulos (avanzado) ----
var LANGUAGE_LABELS={
  'Latino':['Español latino','Latin American Spanish'],'Spanish':['Español (España)','Spanish (Spain)'],
  'English':['Inglés','English'],'Portuguese (Brazil)':['Portugués (Brasil)','Portuguese (Brazil)'],
  'Portuguese':['Portugués (Portugal)','Portuguese (Portugal)'],'French':['Francés','French'],'Italian':['Italiano','Italian'],
  'German':['Alemán','German'],'Dutch':['Neerlandés','Dutch'],'Japanese':['Japonés','Japanese'],'Korean':['Coreano','Korean'],
  'Chinese':['Chino','Chinese'],'Russian':['Ruso','Russian'],'Arabic':['Árabe','Arabic'],'Hindi':['Hindi','Hindi'],
  'Turkish':['Turco','Turkish'],'Polish':['Polaco','Polish'],'Swedish':['Sueco','Swedish'],'Norwegian':['Noruego','Norwegian'],
  'Danish':['Danés','Danish'],'Finnish':['Finés','Finnish'],'Greek':['Griego','Greek'],'Hebrew':['Hebreo','Hebrew'],
  'Czech':['Checo','Czech'],'Hungarian':['Húngaro','Hungarian'],'Romanian':['Rumano','Romanian'],'Ukrainian':['Ucraniano','Ukrainian'],
  'Vietnamese':['Vietnamita','Vietnamese'],'Thai':['Tailandés','Thai'],'Indonesian':['Indonesio','Indonesian'],'Malay':['Malayo','Malay'],
  'Persian':['Persa','Persian'],'Bulgarian':['Búlgaro','Bulgarian'],'Croatian':['Croata','Croatian'],'Serbian':['Serbio','Serbian'],
  'Slovak':['Eslovaco','Slovak'],'Slovenian':['Esloveno','Slovenian'],'Bengali':['Bengalí','Bengali'],'Tamil':['Tamil','Tamil'],
  'Telugu':['Telugu','Telugu'],'Malayalam':['Malayalam','Malayalam'],'Kannada':['Canarés','Kannada'],'Marathi':['Maratí','Marathi'],
  'Lithuanian':['Lituano','Lithuanian'],'Latvian':['Letón','Latvian'],'Estonian':['Estonio','Estonian']
};
// Igual que languageProfile() en el servidor.
var LANGUAGE_DEFAULTS={
  'es-MX':{audio:['Latino','Spanish'],subtitle:['Latino','Spanish','English']},
  'es-ES':{audio:['Spanish'],subtitle:['Spanish','English']},
  'en':{audio:['English'],subtitle:['English']},
  'pt-BR':{audio:['Portuguese (Brazil)','Portuguese'],subtitle:['Portuguese (Brazil)','Portuguese','English']},
  'pt-PT':{audio:['Portuguese','Portuguese (Brazil)'],subtitle:['Portuguese','Portuguese (Brazil)','English']},
  'fr':{audio:['French'],subtitle:['French','English']},
  'it':{audio:['Italian'],subtitle:['Italian','English']},
  'de':{audio:['German'],subtitle:['German','English']},
  'nl':{audio:['Dutch'],subtitle:['Dutch','English']}
};
var languageOrder={audio:[],subtitle:[]};
var languageOrderCustomized=false;
function languageLabel(name){var l=LANGUAGE_LABELS[name];return l?l[document.documentElement.lang==='en'?1:0]:name;}
function languageDefaults(){return LANGUAGE_DEFAULTS[document.getElementById('language').value]||LANGUAGE_DEFAULTS['es-MX'];}
function renderLanguageOrder(){
  ['audio','subtitle'].forEach(function(kind){
    var list=document.getElementById(kind+'LanguageList'),items=languageOrder[kind];
    list.innerHTML=items.map(function(name,i){
      return '<li><b>'+(i+1)+'</b><span>'+esc(languageLabel(name))+'</span>'+
        '<button class="secondary" type="button" data-lang-move="'+kind+'" data-index="'+i+'" data-dir="-1" '+(i===0?'disabled':'')+' aria-label="Subir">↑</button>'+
        '<button class="secondary" type="button" data-lang-move="'+kind+'" data-index="'+i+'" data-dir="1" '+(i===items.length-1?'disabled':'')+' aria-label="Bajar">↓</button>'+
        '<button class="secondary" type="button" data-lang-remove="'+kind+'" data-index="'+i+'" '+(items.length===1?'disabled':'')+' aria-label="Quitar">✕</button></li>';
    }).join('');
    var add=document.getElementById(kind+'LanguageAdd');
    var options=Object.keys(LANGUAGE_LABELS).filter(function(name){return items.indexOf(name)<0;})
      .sort(function(a,b){return languageLabel(a).localeCompare(languageLabel(b));});
    add.innerHTML=options.map(function(name){return '<option value="'+esc(name)+'">'+esc(languageLabel(name))+'</option>';}).join('');
    var addButton=document.querySelector('[data-lang-add="'+kind+'"]');
    if(addButton)addButton.disabled=!options.length||items.length>=8;
  });
}
function resetLanguageOrder(){
  var d=languageDefaults();
  languageOrder={audio:d.audio.slice(),subtitle:d.subtitle.slice()};
  languageOrderCustomized=false;
  renderLanguageOrder();
}
function setLanguageOrder(audio,subtitle){
  var valid=function(list){return Array.isArray(list)?list.filter(function(x){return !!LANGUAGE_LABELS[x];}).slice(0,8):[];};
  var a=valid(audio),s=valid(subtitle);
  if(!a.length&&!s.length){resetLanguageOrder();return;}
  var d=languageDefaults();
  languageOrder={audio:a.length?a:d.audio.slice(),subtitle:s.length?s:d.subtitle.slice()};
  languageOrderCustomized=true;
  renderLanguageOrder();
}
function languageOrderChanged(){
  languageOrderCustomized=true;
  renderLanguageOrder();
  if(backupReady)clearReview('Cambiaste los idiomas: revisa nuevamente el plan.');
}
document.getElementById('languageOrderFold').addEventListener('click',function(e){
  var move=e.target.closest('[data-lang-move]'),remove=e.target.closest('[data-lang-remove]'),add=e.target.closest('[data-lang-add]');
  if(move){
    var list=languageOrder[move.dataset.langMove],from=Number(move.dataset.index),to=from+Number(move.dataset.dir);
    if(to<0||to>=list.length)return;
    list.splice(to,0,list.splice(from,1)[0]);languageOrderChanged();
  }else if(remove){
    var items=languageOrder[remove.dataset.langRemove];
    if(items.length>1){items.splice(Number(remove.dataset.index),1);languageOrderChanged();}
  }else if(add){
    var kind=add.dataset.langAdd,value=document.getElementById(kind+'LanguageAdd').value;
    if(value&&languageOrder[kind].indexOf(value)<0&&languageOrder[kind].length<8){languageOrder[kind].push(value);languageOrderChanged();}
  }
});
document.getElementById('resetLanguageOrder').addEventListener('click',function(){
  resetLanguageOrder();
  if(backupReady)clearReview('Cambiaste los idiomas: revisa nuevamente el plan.');
});
document.getElementById('language').addEventListener('change',function(){if(!languageOrderCustomized)resetLanguageOrder();});
document.getElementById('uiLanguage').addEventListener('change',function(){setTimeout(function(){if(languageOrderCustomized)renderLanguageOrder();else resetLanguageOrder();},0);});
document.getElementById('watchly').addEventListener('change',function(){if(backupReady)clearReview('Cambiaste las recomendaciones: revisa nuevamente el plan.');});

// ---- Después de instalar: Watchly, Trakt y personalización del inicio ----
function watchlyResultHtml(d){
  if(!d.watchly)return '';
  if(d.watchly.installed)return '<div class="note good"><b>Watchly instalado.</b> Tus filas de recomendaciones aparecerán en el inicio a medida que '+platformName()+' tenga historial. La primera carga puede tardar un par de minutos.</div>';
  if(d.watchly.reused)return '<div class="note"><b>Watchly no respondió</b>, así que se conservó el Watchly que ya tenías. Puedes volver a intentarlo más tarde.</div>';
  return '<div class="note bad"><b>Watchly no respondió y no se instaló.</b> El resto quedó configurado. Puedes intentarlo más tarde repitiendo el wizard con Watchly marcado.</div>';
}
function traktGuideHtml(platform,watchly){
  var app=platform==='nuvio'
    ?'<li>En Nuvio, abre Ajustes › Integraciones, elige Trakt e inicia sesión.</li>'
    :'<li>En Stremio, abre Ajustes, busca Trakt y pulsa Autenticar. También puedes hacerlo en <a class="link" href="https://web.stremio.com/#/settings" target="_blank" rel="noopener noreferrer">web.stremio.com ↗</a>.</li>';
  return '<details class="fold"><summary>Conectar Trakt (opcional)</summary>'+
    '<div class="small" style="margin:8px 0">Trakt guarda lo que ves y lo sincroniza entre apps y dispositivos. La autorización la das tú directamente en Trakt; el wizard nunca ve esa cuenta.</div>'+
    '<ol class="small">'+app+
      (watchly?'<li>Para que Watchly también use tu historial de Trakt, entra a <a class="link" href="https://watchly.elfhosted.com/configure" target="_blank" rel="noopener noreferrer">Watchly ↗</a>, inicia sesión con la misma cuenta y conecta Trakt.</li>':'')+
    '</ol></details>';
}
var customize={addons:[],order:[],catalogs:{},names:{},platform:'stremio'};
function startCustomizer(addons,platform){
  customize={addons:Array.isArray(addons)?addons:[],order:[],catalogs:{},names:{},platform:platform==='nuvio'?'nuvio':'stremio'};
  customize.order=customize.addons.map(function(_,i){return i;});
  customize.addons.forEach(function(a,i){customize.catalogs[i]=(a.catalogs||[]).map(catalogKey);});
  renderCustomizer();
}
function renderCustomizer(){
  var box=document.getElementById('customizeList');if(!box)return;
  var open={};box.querySelectorAll('details[data-index]').forEach(function(d){if(d.open)open[d.dataset.index]=true;});
  var html='';
  customize.order.forEach(function(index,position){
    var a=customize.addons[index];
    html+='<div class="check orderRow"><b>'+(position+1)+'. '+esc(a.name)+'</b>'+
      '<div class="actions"><button class="secondary customizeMove" type="button" data-position="'+position+'" data-dir="-1" '+(position===0?'disabled':'')+'>↑ Subir</button>'+
      '<button class="secondary customizeMove" type="button" data-position="'+position+'" data-dir="1" '+(position===customize.order.length-1?'disabled':'')+'>↓ Bajar</button></div>';
    if(customize.platform!=='nuvio'&&a.catalogs&&a.catalogs.length){
      html+='<details data-index="'+index+'"'+(open[index]?' open':'')+'><summary class="small">Catálogos ('+a.catalogs.length+')</summary>';
      a.catalogs.forEach(function(c){
        var key=catalogKey(c),checked=(customize.catalogs[index]||[]).indexOf(key)>=0;
        var name=(customize.names[index]&&customize.names[index][key]!==undefined)?customize.names[index][key]:c.name;
        html+='<div class="catalogRow"><input class="customizeCatalog" type="checkbox" aria-label="Mostrar catálogo" data-index="'+index+'" data-key="'+esc(key)+'" '+(checked?'checked':'')+'>'+
          '<input class="customizeName" type="text" maxlength="60" aria-label="Nombre del catálogo" data-index="'+index+'" data-key="'+esc(key)+'" value="'+esc(name)+'">'+
          '<span class="small">'+esc(c.type==='movie'?'Películas':c.type==='series'?'Series':c.type)+'</span></div>';
      });
      html+='</details>';
    }
    html+='</div>';
  });
  box.innerHTML=html;
}
document.addEventListener('click',function(e){
  var btn=e.target.closest('.customizeMove');if(!btn)return;
  var from=Number(btn.dataset.position),to=from+Number(btn.dataset.dir);
  if(to<0||to>=customize.order.length)return;
  customize.order.splice(to,0,customize.order.splice(from,1)[0]);
  renderCustomizer();
});
document.addEventListener('change',function(e){
  if(e.target.classList.contains('customizeCatalog')){
    var index=Number(e.target.dataset.index),key=e.target.dataset.key,set=new Set(customize.catalogs[index]||[]);
    if(e.target.checked)set.add(key);else set.delete(key);
    customize.catalogs[index]=Array.from(set);
  }
});
document.addEventListener('input',function(e){
  if(!e.target.classList.contains('customizeName'))return;
  var index=Number(e.target.dataset.index);
  customize.names[index]=customize.names[index]||{};
  customize.names[index][e.target.dataset.key]=e.target.value;
});
document.addEventListener('click',async function(e){
  var btn=e.target.closest('#customizeSave');if(!btn)return;
  var result=document.getElementById('customizeResult');
  if(!latestSourceFingerprint){result.textContent='Vuelve a conectar la cuenta para personalizar.';return;}
  var empty=Object.keys(customize.catalogs).some(function(i){
    return (customize.addons[i].catalogs||[]).length&&!(customize.catalogs[i]||[]).length;
  });
  if(empty){result.textContent='Deja al menos un catálogo marcado en cada complemento.';return;}
  var choices={},names={};
  customize.addons.forEach(function(a,i){
    var all=(a.catalogs||[]).map(catalogKey);
    if(customize.platform!=='nuvio'&&(customize.catalogs[i]||[]).length!==all.length)choices[i]=customize.catalogs[i];
    var changed={};
    Object.keys(customize.names[i]||{}).forEach(function(key){
      var original=(a.catalogs||[]).find(function(c){return catalogKey(c)===key;});
      var value=String(customize.names[i][key]||'').trim();
      if(original&&value&&value!==original.name)changed[key]=value;
    });
    if(customize.platform!=='nuvio'&&Object.keys(changed).length)names[i]=changed;
  });
  if(!confirm('¿Guardar el nuevo orden y los catálogos en '+platformName()+'? Antes se guarda un respaldo para poder volver atrás.'))return;
  setBusy(btn,true,'Guardando…');
  try{
    var r=await post('/api/organize',Object.assign({},authPayload(),{
      expectedFingerprint:latestSourceFingerprint,order:customize.order,catalogChoices:choices,catalogNames:names
    }));
    latestSourceFingerprint=r.sourceFingerprint||'';
    showInstalledAddons(r.addons);
    startCustomizer(r.addons,customize.platform);
    result.textContent='✓ Guardado. Cierra y vuelve a abrir '+platformName()+' para ver el nuevo orden. El respaldo previo quedó guardado en este navegador.';
  }catch(err){result.textContent='No se pudo guardar: '+err.message;}
  finally{setBusy(btn,false);}
});
initAccess();
resetLanguageOrder();
// i18n.js se carga después y puede ajustar el idioma del contenido: se recalcula al terminar.
setTimeout(function(){if(!languageOrderCustomized)resetLanguageOrder();},0);
showWizardStep(1);
addDebrid('torbox');
syncDebridMode(false);
syncForgetButton();
restoreRememberedAccount();
health();
