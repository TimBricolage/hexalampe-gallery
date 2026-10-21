/*************************
  I18N - moteur de langues
  - fr.js et en.js sont chargés dans index.html
  - les autres langues (lang/xx.js) sont chargées à la demande
  Pour ajouter une langue : créer lang/xx.js (copie de en.js) + l'ajouter dans LANGS ci-dessous.
**************************/
(function(){
  const LANGS = [
    {code:"fr", name:"Français"},
    {code:"en", name:"English"},
    {code:"de", name:"Deutsch"},
    {code:"es", name:"Español"},
    {code:"zh", name:"中文（简体）", bcp:"zh-CN"},
    {code:"ru", name:"Русский"},
    {code:"pt", name:"Português"},
    {code:"it", name:"Italiano"},
    {code:"ja", name:"日本語"},
    {code:"ko", name:"한국어"},
    {code:"ar", name:"العربية", dir:"rtl"},
    {code:"hi", name:"हिन्दी"},
    {code:"tr", name:"Türkçe"},
    {code:"nl", name:"Nederlands"},
    {code:"pl", name:"Polski"},
    {code:"uk", name:"Українська"},
    {code:"id", name:"Bahasa Indonesia"},
    {code:"vi", name:"Tiếng Việt"},
    {code:"th", name:"ไทย"},
    {code:"sv", name:"Svenska"}
  ];

  const STORE_KEY = "hexalampe_lang";
  const data = {};
  let current = "en";

  function register(code, dict){ data[code] = dict; }

  function info(code){ return LANGS.find(l => l.code === code) || LANGS[1]; }

  function t(key, vars){
    let s = (data[current] && data[current][key]);
    if(s === undefined) s = data.en && data.en[key];
    if(s === undefined) s = key;
    if(vars){
      for(const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    }
    return s;
  }

  function load(code){
    return new Promise(resolve => {
      if(data[code]) return resolve(true);
      const sc = document.createElement("script");
      sc.src = "lang/" + code + ".js";
      sc.onload = () => resolve(!!data[code]);
      sc.onerror = () => resolve(false);
      document.head.appendChild(sc);
    });
  }

  function apply(root){
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-title]").forEach(el => {
      const v = t(el.dataset.i18nTitle);
      el.title = v; el.setAttribute("aria-label", v);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  async function set(code){
    if(!LANGS.some(l => l.code === code)) code = "en";
    const ok = await load(code);
    if(!ok) code = "en";
    current = code;
    try{ localStorage.setItem(STORE_KEY, code); }catch(e){}
    const li = info(code);
    document.documentElement.lang = li.bcp || code;
    document.documentElement.dir = li.dir || "ltr";
    apply();
    document.dispatchEvent(new CustomEvent("langchange", {detail:{code}}));
  }

  function detect(){
    try{
      const saved = localStorage.getItem(STORE_KEY);
      if(saved && LANGS.some(l => l.code === saved)) return saved;
    }catch(e){}
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
    for(const p of prefs){
      const base = String(p).toLowerCase().split("-")[0];
      if(LANGS.some(l => l.code === base)) return base;
    }
    return "en";
  }

  window.I18N = {
    LANGS, register, t, set, apply, detect, info,
    get current(){ return current; },
    get bcp(){ return info(current).bcp || current; },
    get dir(){ return info(current).dir || "ltr"; }
  };
  window.t = t;
})();
