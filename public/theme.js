// Tema claro/oscuro: "auto" sigue al sistema; la elección se guarda en este navegador.
// El wizard activa su hoja clara (#lightTheme); las guías activan su hoja oscura (#darkTheme).
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
