// Tema claro/oscuro: "auto" sigue al sistema; la elección se guarda en este navegador.
// El wizard activa su hoja clara (#lightTheme); las guías activan su hoja oscura (#darkTheme).
(function(){
  // Llegada desde la dirección antigua (wizard.stremio-nuvio.workers.dev): trae tema e idioma.
  try{
    var q=new URLSearchParams(location.search);
    if(q.get('mig')==='1'){
      var th=q.get('th'),la=q.get('la');
      if(th==='light'||th==='dark')localStorage.setItem('wizard-theme',th);
      if(la==='es'||la==='en')localStorage.setItem('stremio-wizard-ui-language',la);
      sessionStorage.setItem('mandrake-moved','1');
      ['mig','th','la'].forEach(function(k){q.delete(k);});
      var rest=q.toString();
      history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash);
    }
  }catch(_){}
})();
(function(){
  var KEY='wizard-theme';
  function get(){try{var t=localStorage.getItem(KEY);return t==='light'||t==='dark'?t:'auto';}catch(_){return 'auto';}}
  function apply(t){
    var light=document.getElementById('lightTheme'),dark=document.getElementById('darkTheme');
    if(light)light.media=t==='light'?'all':t==='dark'?'not all':'(prefers-color-scheme: light)';
    if(dark)dark.media=t==='dark'?'all':t==='light'?'not all':'(prefers-color-scheme: dark)';
    document.documentElement.dataset.theme=t;
  }
  window.wizardTheme={get:get,set:function(t){try{if(t==='auto')localStorage.removeItem(KEY);else localStorage.setItem(KEY,t);}catch(_){}apply(t);}};
  apply(get());
  // Selectores con data-theme-select (guías): se sincronizan solos.
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('[data-theme-select]').forEach(function(sel){
      sel.value=get();sel.addEventListener('change',function(){window.wizardTheme.set(sel.value);});
    });
  });
})();
