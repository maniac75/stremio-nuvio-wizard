// Tema claro/oscuro: "auto" sigue al sistema; la elección se guarda en este navegador.
(function(){
  var KEY='wizard-theme';
  function get(){try{var t=localStorage.getItem(KEY);return t==='light'||t==='dark'?t:'auto';}catch(_){return 'auto';}}
  function apply(t){
    var light=document.getElementById('lightTheme');
    if(light)light.media=t==='light'?'all':t==='dark'?'not all':'(prefers-color-scheme: light)';
    document.documentElement.dataset.theme=t;
  }
  window.wizardTheme={get:get,set:function(t){try{if(t==='auto')localStorage.removeItem(KEY);else localStorage.setItem(KEY,t);}catch(_){}apply(t);}};
  apply(get());
})();
