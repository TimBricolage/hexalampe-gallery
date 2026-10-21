/*************************
  APP - configurateur HexaLamp
**************************/
(function(){

  /*************************
    GRILLE 2D
  **************************/
  const HEX_RADIUS = 30;
  const W = 800, H = 600;          // taille logique du canvas
  const DPR = 2;                   // résolution interne (net sur écrans HD)

  const grid = new Map();          // "q,r" -> {q,r,thickness}  (l'ordre d'insertion = numéro de pièce)
  let selectedThickness = 1;
  let hover = null;

  const canvas = document.getElementById("grid");
  const ctx = canvas.getContext("2d");
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  const FILL = { 1:"#123447", 2:"#175069", 3:"#1b6a8c", 4:"#2a9fc0" };
  const FONT = '"Segoe UI","Noto Sans",Arial,sans-serif';

  function axialToPixel(q, r){
    return {
      x: HEX_RADIUS * Math.sqrt(3) * (q + r/2) + W/2,
      y: HEX_RADIUS * 1.5 * r + H/2
    };
  }

  function insideCanvas(p){ return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H; }

  function hexPath(cx, cy, size){
    ctx.beginPath();
    for(let i=0;i<6;i++){
      const a = Math.PI/3*i + Math.PI/6;
      const px = cx + size*Math.cos(a), py = cy + size*Math.sin(a);
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }

  function drawGrid(){
    ctx.clearRect(0, 0, W, H);

    // toutes les cases dont le centre est dans le canvas
    for(let r=-14; r<=14; r++){
      for(let q=-22; q<=22; q++){
        const p = axialToPixel(q, r);
        if(p.x < -HEX_RADIUS || p.x > W+HEX_RADIUS || p.y < -HEX_RADIUS || p.y > H+HEX_RADIUS) continue;

        const key = q + "," + r;
        const h = grid.get(key);

        hexPath(p.x, p.y, HEX_RADIUS - 1);
        if(h){
          ctx.fillStyle = FILL[h.thickness];
          ctx.fill();
          ctx.strokeStyle = h.thickness === 4 ? "#7ff3ff" : "#19e3ff";
          ctx.lineWidth = h.thickness === 4 ? 2.4 : 1.5;
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 15px " + FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(h.thickness, p.x, p.y + 1);
        }else if(hover && hover.q === q && hover.r === r && insideCanvas(p)){
          ctx.fillStyle = "rgba(25,227,255,.14)";
          ctx.fill();
          ctx.strokeStyle = "rgba(25,227,255,.7)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }else{
          ctx.strokeStyle = "rgba(190,205,215,.16)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  function pixelToHex(x, y){
    x -= W/2; y -= H/2;
    const q = (Math.sqrt(3)/3*x - 1/3*y) / HEX_RADIUS;
    const r = (2/3*y) / HEX_RADIUS;
    return hexRound(q, r);
  }

  function hexRound(q, r){
    const x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx-x), dy = Math.abs(ry-y), dz = Math.abs(rz-z);
    if(dx > dy && dx > dz) rx = -ry - rz;
    else if(dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q:rx, r:rz };
  }

  // coordonnées souris/doigt -> coordonnées logiques du canvas (tient compte de l'échelle CSS)
  function eventToHex(e){
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * W / rect.width;
    const y = (e.clientY - rect.top)  * H / rect.height;
    return pixelToHex(x, y);
  }

  canvas.addEventListener("click", e => {
    const h = eventToHex(e);
    if(!insideCanvas(axialToPixel(h.q, h.r))) return;
    const key = h.q + "," + h.r;
    if(grid.has(key)) grid.delete(key);
    else grid.set(key, { q:h.q, r:h.r, thickness:selectedThickness });
    drawGrid();
    update3D();
  });

  canvas.addEventListener("mousemove", e => {
    const h = eventToHex(e);
    if(!hover || hover.q !== h.q || hover.r !== h.r){ hover = h; drawGrid(); }
  });
  canvas.addEventListener("mouseleave", () => { hover = null; drawGrid(); });

  drawGrid();

  /*************************
    CHOIX DE L'ÉPAISSEUR
  **************************/
  document.querySelectorAll(".size").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedThickness = parseInt(btn.dataset.size, 10);
      document.querySelectorAll(".size").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  /*************************
    RENDU 3D
  **************************/
  const wrapper = document.getElementById("three-wrapper");
  const viewer = new HexViewer(document.getElementById("three-container"));

  const fsBtn = document.getElementById("fullscreen-btn");
  const reqFS = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
  if(!reqFS){
    fsBtn.hidden = true;                 // ex : iPhone
  }else{
    fsBtn.addEventListener("click", () => {
      if(!document.fullscreenElement && !document.webkitFullscreenElement) reqFS.call(wrapper);
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    });
  }

  function getHexes(){
    return [...grid.values()].map(h => ({ q:h.q, r:h.r, thickness:h.thickness }));
  }

  function update3D(){
    const wasEmpty = viewer.hexGroup.children.length === 0;
    viewer.setHexes(getHexes());
    if(wasEmpty && grid.size) viewer.fit();     // cadre le modèle dès le premier hexagone
  }

  function loadHexes(list){
    grid.clear();
    for(const h of list) grid.set(h.q + "," + h.r, { q:h.q, r:h.r, thickness:h.thickness });
    drawGrid();
    update3D();
    viewer.fit();
  }

  /*************************
    NOTIFICATIONS
  **************************/
  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function showToast(msg, isErr, ms){
    toastEl.textContent = msg;
    toastEl.classList.toggle("err", !!isErr);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    if(ms !== 0) toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 4500);
  }
  function hideToast(){ toastEl.hidden = true; }

  // message d'erreur traduit à partir d'une erreur d'analyse
  function analysisMessage(err){
    if(err && err.code === "empty") return t("errEmpty");
    if(err && err.code === "isolated") return t("errIsolated", { n: err.n });
    if(err && err.code === "pattern") return t("errPattern");
    return t("errPdf");
  }

  /*************************
    VALIDER -> TÉLÉCHARGER LA NOTICE
  **************************/
  const validateBtn = document.getElementById("validate");
  validateBtn.addEventListener("click", async () => {
    validateBtn.disabled = true;
    showToast(t("generating"), false, 0);
    try{
      await Notice.downloadNotice(getHexes());
      hideToast();
    }catch(err){
      console.error(err);
      showToast(analysisMessage(err), true, 6000);
    }finally{
      validateBtn.disabled = false;
    }
  });

  /*************************
    ONGLETS
  **************************/
  function switchView(name){
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    document.getElementById("view-config").hidden  = name !== "config";
    document.getElementById("view-gallery").hidden = name !== "gallery";
    document.getElementById("bottom").hidden = name !== "config";
    if(name === "config") viewer.resize();
    document.dispatchEvent(new CustomEvent("viewchange", { detail:{ name } }));
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));

  /*************************
    MENU DES LANGUES
  **************************/
  const langBtn = document.getElementById("lang-btn");
  const langMenu = document.getElementById("lang-menu");
  const langCur = document.getElementById("lang-current");

  function buildLangMenu(){
    langMenu.innerHTML = "";
    I18N.LANGS.forEach(l => {
      const b = document.createElement("button");
      b.className = "lang-item" + (l.code === I18N.current ? " active" : "");
      b.textContent = l.name;
      b.lang = l.bcp || l.code;
      b.dir = l.dir || "ltr";
      b.addEventListener("click", async () => {
        await I18N.set(l.code);
        closeLangMenu();
      });
      langMenu.appendChild(b);
    });
  }
  function closeLangMenu(){ langMenu.hidden = true; langBtn.setAttribute("aria-expanded", "false"); }

  langBtn.addEventListener("click", e => {
    e.stopPropagation();
    if(langMenu.hidden){ buildLangMenu(); langMenu.hidden = false; langBtn.setAttribute("aria-expanded", "true"); }
    else closeLangMenu();
  });
  document.addEventListener("click", e => { if(!langMenu.hidden && !langMenu.contains(e.target)) closeLangMenu(); });
  document.addEventListener("keydown", e => { if(e.key === "Escape") closeLangMenu(); });

  document.addEventListener("langchange", () => {
    langCur.textContent = I18N.current.toUpperCase();
    document.title = "HexaLamp";
  });

  /*************************
    DÉMARRAGE
  **************************/
  I18N.set(I18N.detect());

  window.App = { getHexes, loadHexes, showToast, hideToast, switchView, analysisMessage };
})();
