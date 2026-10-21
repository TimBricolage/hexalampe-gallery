/*************************
  GALERIE - partage de modèles + affichage
  Les modèles sont stockés dans le dépôt GitHub : models/index.json, models/<id>.json, models/<id>.jpg
  L'écriture passe par un petit "Worker" Cloudflare (voir GUIDE_INSTALLATION.md).
**************************/
(function(){
  const CFG = window.HEXA_CONFIG || {};
  const PAGE_SIZE = 24;
  const PENDING_KEY = "hexalampe_pending";

  const $ = id => document.getElementById(id);

  /*************************
    OUTILS
  **************************/
  function sanitizeHexes(arr){
    if(!Array.isArray(arr)) return [];
    const out = [];
    for(const a of arr.slice(0, 500)){
      const q = a[0], r = a[1], th = a[2];
      if(Number.isInteger(q) && Number.isInteger(r) && [1,2,3,4].includes(th)) out.push({ q, r, thickness:th });
    }
    return out;
  }

  function fmtDate(iso){
    try{ return new Intl.DateTimeFormat(I18N.bcp, { dateStyle:"medium" }).format(new Date(iso)); }
    catch(e){ return ""; }
  }

  function getPending(){
    try{ return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); }catch(e){ return []; }
  }
  function setPending(list){
    try{ localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-10))); }catch(e){}
  }

  /*************************
    PARTAGER UN MODÈLE
  **************************/
  const shareModal = $("share-modal");
  const shareName  = $("share-name");
  const shareMsg   = $("share-msg");
  const shareOk    = $("share-ok");
  let pendingThumb = null;
  let sending = false;

  function setMsg(text, kind){
    shareMsg.textContent = text || "";
    shareMsg.className = "msg" + (kind ? " " + kind : "");
  }

  function openShare(){
    App.hideToast();
    if(!CFG.API_URL){ App.showToast(t("errOff"), true, 6000); return; }
    const hexes = App.getHexes();
    try{ Notice.analyze(hexes); }
    catch(err){ App.showToast(App.analysisMessage(err), true, 6000); return; }

    try{ pendingThumb = makeThumbnail(hexes, 360, 270); }catch(e){ console.error(e); pendingThumb = null; }
    const prev = $("share-preview");
    prev.innerHTML = "";
    if(pendingThumb){
      const img = document.createElement("img");
      img.src = pendingThumb; img.alt = "";
      prev.appendChild(img);
    }
    setMsg("");
    shareOk.disabled = false;
    try{ shareName.value = localStorage.getItem("hexalampe_creator") || ""; }catch(e){ shareName.value = ""; }
    $("share-website").value = "";
    shareModal.hidden = false;
    setTimeout(() => shareName.focus(), 50);
  }

  function closeShare(){ if(!sending) shareModal.hidden = true; }

  async function submitShare(){
    if(sending) return;
    const name = shareName.value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if(!name || name.length > (CFG.MAX_NAME || 30)){ setMsg(t("errName"), "err"); shareName.focus(); return; }

    const hexes = App.getHexes();
    try{ Notice.analyze(hexes); }
    catch(err){ setMsg(App.analysisMessage(err), "err"); return; }

    sending = true; shareOk.disabled = true;
    setMsg(t("sending"));

    try{
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 40000);
      const res = await fetch(CFG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          hexes: hexes.map(h => [h.q, h.r, h.thickness]),
          thumb: pendingThumb,
          website: $("share-website").value     // champ piège anti-robots
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      let json = {};
      try{ json = await res.json(); }catch(e){}

      if(res.ok && json.ok){
        try{ localStorage.setItem("hexalampe_creator", name); }catch(e){}
        const list = getPending().filter(p => p.id !== json.id);
        list.push({ id:json.id, name, date:new Date().toISOString(), n:hexes.length,
                    hexes:hexes.map(h => [h.q,h.r,h.thickness]), thumb:pendingThumb });
        setPending(list);
        setMsg(t("shared"), "ok");
        sending = false;
        setTimeout(() => { shareModal.hidden = true; shareOk.disabled = false; }, 2200);
        return;
      }

      const map = { name:"errName", exists:"errExists", rate:"errRate" };
      const code = json.error;
      if(map[code]) setMsg(t(map[code]), "err");
      else if(["empty","isolated","pattern"].includes(code)) setMsg(App.analysisMessage({ code, n:json.n }), "err");
      else setMsg(t("errServer"), "err");
    }catch(e){
      console.error(e);
      setMsg(t("errNet"), "err");
    }
    sending = false;
    shareOk.disabled = false;
  }

  $("share").addEventListener("click", openShare);
  $("share-cancel").addEventListener("click", closeShare);
  shareOk.addEventListener("click", submitShare);
  shareName.addEventListener("keydown", e => { if(e.key === "Enter") submitShare(); });
  shareModal.addEventListener("click", e => { if(e.target === shareModal) closeShare(); });

  /*************************
    GALERIE
  **************************/
  const gridEl = $("gallery-grid");
  const statusEl = $("gallery-status");
  const moreBtn = $("gallery-more");
  let items = [];       // éléments affichés (en attente + publiés)
  let shown = 0;
  let loaded = false;

  async function loadGallery(){
    statusEl.textContent = t("galLoading");
    gridEl.innerHTML = ""; moreBtn.hidden = true;
    let index = [];
    try{
      const res = await fetch(CFG.INDEX_URL + "?t=" + Date.now(), { cache:"no-store" });
      if(!res.ok) throw new Error("HTTP " + res.status);
      index = await res.json();
      if(!Array.isArray(index)) index = [];
    }catch(e){
      console.error(e);
      // fichier absent (ex : ouverture locale) : on n'affiche que les envois en attente
      index = null;
    }

    const known = new Set((index || []).map(m => m.id));
    // on oublie les envois locaux déjà publiés
    const pending = getPending().filter(p => !known.has(p.id));
    setPending(pending);

    const published = (index || []).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
    items = pending.slice().reverse().map(p => ({ ...p, pending:true })).concat(published);
    shown = 0; loaded = true;

    if(index === null && !pending.length){ statusEl.textContent = t("galError"); return; }
    statusEl.textContent = items.length ? "" : t("galEmpty");
    showMore();
  }

  function showMore(){
    const slice = items.slice(shown, shown + PAGE_SIZE);
    slice.forEach(m => gridEl.appendChild(makeCard(m)));
    shown += slice.length;
    moreBtn.hidden = shown >= items.length;
  }

  function makeCard(m){
    const card = document.createElement("button");
    card.className = "card";
    card.type = "button";

    const img = document.createElement("img");
    img.className = "thumb"; img.loading = "lazy"; img.alt = "";
    img.src = m.thumb || ("models/" + encodeURIComponent(m.id) + ".jpg");
    card.appendChild(img);

    if(m.pending){
      const b = document.createElement("span");
      b.className = "badge"; b.textContent = t("galPending");
      card.appendChild(b);
    }

    const info = document.createElement("div");
    info.className = "info";
    const by = document.createElement("div");
    by.className = "by"; by.textContent = t("galBy", { name: m.name });
    const meta = document.createElement("div");
    meta.className = "meta"; meta.textContent = t("galCount", { n: m.n }) + " · " + fmtDate(m.date);
    info.appendChild(by); info.appendChild(meta);
    card.appendChild(info);

    card.addEventListener("click", () => openModel(m));
    return card;
  }

  moreBtn.addEventListener("click", showMore);

  /*************************
    VISIONNEUSE D'UN MODÈLE
  **************************/
  const modelModal = $("model-modal");
  let modelViewer = null;
  let current = null;       // { item, hexes }

  function renderModelTexts(){
    if(!current) return;
    $("model-title").textContent = t("galBy", { name: current.item.name });
    $("model-sub").textContent = t("galCount", { n: current.item.n }) + " · " + fmtDate(current.item.date);
  }

  async function openModel(item){
    current = { item, hexes:null };
    renderModelTexts();
    modelModal.hidden = false;

    const holder = $("model-viewer");
    modelViewer = new HexViewer(holder);

    try{
      let raw;
      if(item.pending && item.hexes) raw = item.hexes;
      else{
        const res = await fetch("models/" + encodeURIComponent(item.id) + ".json", { cache:"no-store" });
        if(!res.ok) throw new Error("HTTP " + res.status);
        raw = (await res.json()).hexes;
      }
      const hexes = sanitizeHexes(raw);
      if(!hexes.length) throw new Error("empty model");
      if(!modelViewer) return;                 // modale fermée entre-temps
      current.hexes = hexes;
      modelViewer.setHexes(hexes);
      modelViewer.fit();
    }catch(e){
      console.error(e);
      App.showToast(t("galError"), true, 5000);
    }
  }

  function closeModel(){
    modelModal.hidden = true;
    if(modelViewer){ modelViewer.destroy(); modelViewer = null; }
    current = null;
  }

  $("model-close").addEventListener("click", closeModel);
  modelModal.addEventListener("click", e => { if(e.target === modelModal) closeModel(); });
  document.addEventListener("keydown", e => {
    if(e.key !== "Escape") return;
    if(!modelModal.hidden) closeModel();
    else if(!shareModal.hidden) closeShare();
  });

  // la notice est téléchargée dans la langue du VISITEUR (langue courante du site)
  $("model-download").addEventListener("click", async () => {
    if(!current || !current.hexes) return;
    const btn = $("model-download");
    btn.disabled = true;
    App.showToast(t("generating"), false, 0);
    try{
      await Notice.downloadNotice(current.hexes, { creator: current.item.name });
      App.hideToast();
    }catch(err){
      console.error(err);
      App.showToast(App.analysisMessage(err), true, 6000);
    }finally{
      btn.disabled = false;
    }
  });

  $("model-edit").addEventListener("click", () => {
    if(!current || !current.hexes) return;
    const hexes = current.hexes;
    closeModel();
    App.loadHexes(hexes);
    App.switchView("config");
  });

  /*************************
    ÉVÉNEMENTS
  **************************/
  document.addEventListener("viewchange", e => { if(e.detail.name === "gallery") loadGallery(); });

  document.addEventListener("langchange", () => {
    renderModelTexts();
    if(loaded && !$("view-gallery").hidden){
      // re-génère les cartes dans la nouvelle langue
      const n = shown;
      gridEl.innerHTML = ""; shown = 0;
      items.slice(0, n).forEach(m => gridEl.appendChild(makeCard(m)));
      shown = Math.min(n, items.length);
      statusEl.textContent = items.length ? "" : t("galEmpty");
    }
  });
})();
