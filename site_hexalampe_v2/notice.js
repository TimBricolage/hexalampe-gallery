/*************************
  NOTICE - analyse des pièces + génération du PDF multilingue
  Le PDF est dessiné via <canvas> (polices du système) : cela permet
  d'afficher correctement le chinois, l'arabe, le russe, l'hindi, le thaï, etc.
  ce que les polices intégrées de jsPDF ne savent pas faire.
**************************/
(function(){

  // ====== TYPES DE LIAISONS ======
  const LINK_TYPE_MAP = {
    "111110":"A","111101":"A","111011":"A","110111":"A","101111":"A","011111":"A",
    "111100":"B","111001":"B","110011":"B","100111":"B","001111":"B","011110":"B",
    "111000":"C","110001":"C","100011":"C","000111":"C","001110":"C","011100":"C",
    "110000":"D","100001":"D","000011":"D","000110":"D","001100":"D","011000":"D",
    "100000":"E","000001":"E","000010":"E","000100":"E","001000":"E","010000":"E",
    "011101":"F","111010":"F","110101":"F","101011":"F","010111":"F","101110":"F",
    "011011":"G","110110":"G","101101":"G",
    "001101":"H","011010":"H","110100":"H","101001":"H","100110":"H","010011":"H",
    "011001":"I","110010":"I","100101":"I","001011":"I","010110":"I","101100":"I",
    "010010":"J","100100":"J","001001":"J",
    "101000":"K","010001":"K","100010":"K","000101":"K","001010":"K","010100":"K",
    "111111":"L",
    "101010":"M","010101":"M"
  };

  const HEX_DIRS = [
    {q:1, r:0}, {q:1, r:-1}, {q:0, r:-1}, {q:-1, r:0}, {q:-1, r:1}, {q:0, r:1}
  ];

  function axialToPixel(q, r, R){
    return { x: R * Math.sqrt(3) * (q + r/2), y: R * 1.5 * r };
  }

  /**
   * hexes : [{q,r,thickness}] dans l'ordre de pose (l'ordre = numéro de pièce)
   * Retourne les pièces analysées, ou lève une erreur {code, n}.
   */
  function analyze(hexes){
    if(!hexes || hexes.length < 2) throw { code:"empty" };

    const map = new Map();
    const list = hexes.map((h,i) => {
      const o = { q:h.q, r:h.r, thickness:h.thickness, index:i+1 };
      map.set(h.q + "," + h.r, o);
      return o;
    });

    for(const h of list){
      let bits = "";
      for(const d of HEX_DIRS) bits += map.has((h.q+d.q) + "," + (h.r+d.r)) ? "1" : "0";
      if(bits === "000000") throw { code:"isolated", n:h.index };
      const type = LINK_TYPE_MAP[bits];
      if(!type) throw { code:"pattern", n:h.index };
      h.pattern = bits;
      h.type = type;
    }

    // comptage des pièces
    const partCount = {};
    for(const h of list){
      const name = h.thickness + "-" + h.type + ".stl";
      partCount[name] = (partCount[name] || 0) + 1;
    }

    // comptage des liaisons
    let liaison123 = 0, liaison4 = 0;
    for(const h of list){
      for(let i=0;i<6;i++){
        if(h.pattern[i] === "1"){
          const d = HEX_DIRS[i];
          const other = map.get((h.q+d.q) + "," + (h.r+d.r));
          if(other && h.index < other.index){
            if(h.thickness === 4 || other.thickness === 4) liaison4++; else liaison123++;
          }
        }
      }
    }

    return { list, partCount, liaison123, liaison4 };
  }

  /*************************
    IMAGE NUMÉROTÉE (plan de montage)
  **************************/
  function generateNumberedImage(list){
    const W = 1000, H = 720, pad = 50;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff"; x.fillRect(0,0,W,H);

    // taille adaptée pour remplir l'image
    const unit = axialToPixel(0,0,1);
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for(const h of list){
      const p = axialToPixel(h.q, h.r, 1);
      minX = Math.min(minX, p.x - Math.sqrt(3)/2); maxX = Math.max(maxX, p.x + Math.sqrt(3)/2);
      minY = Math.min(minY, p.y - 1);              maxY = Math.max(maxY, p.y + 1);
    }
    const R = Math.min(60, (W-2*pad)/(maxX-minX), (H-2*pad)/(maxY-minY));
    const offX = W/2 - (minX+maxX)/2 * R;
    const offY = H/2 - (minY+maxY)/2 * R;

    const font = '"Segoe UI","Noto Sans","Helvetica Neue",Arial,sans-serif';
    for(const h of list){
      const p = axialToPixel(h.q, h.r, R);
      const cx = p.x + offX, cy = p.y + offY;

      x.beginPath();
      for(let i=0;i<6;i++){
        const a = Math.PI/3*i + Math.PI/6;
        const px = cx + (R-1.5)*Math.cos(a), py = cy + (R-1.5)*Math.sin(a);
        if(i===0) x.moveTo(px,py); else x.lineTo(px,py);
      }
      x.closePath();
      x.fillStyle = h.thickness === 4 ? "#fff3c4" : "#e8eef2";
      x.fill();
      x.strokeStyle = "#1b2833"; x.lineWidth = 2.5; x.stroke();

      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = "#d00000";
      x.font = "bold " + Math.round(R*0.55) + "px " + font;
      x.fillText(String(h.index), cx, cy - (R > 24 ? R*0.12 : 0));
      if(R > 24){
        x.fillStyle = "#4a5a66";
        x.font = Math.round(R*0.27) + "px " + font;
        x.fillText(h.thickness + "-" + h.type, cx, cy + R*0.40);
      }
    }
    return c.toDataURL("image/png");
  }

  /*************************
    RENDU PDF VIA CANVAS
  **************************/
  const PAGE_W = 794, PAGE_H = 1123, SCALE = 2.5; // A4 @96dpi
  const M = 56;                                   // marges
  const FONT = '"Segoe UI","Noto Sans","Noto Sans CJK SC","Noto Sans Arabic","Noto Sans Devanagari","Noto Sans Thai","PingFang SC","Microsoft YaHei","Hiragino Sans","Malgun Gothic","Tahoma","Helvetica Neue",Arial,sans-serif';

  function segmentWords(text, lang){
    if(window.Intl && Intl.Segmenter){
      try{ return [...new Intl.Segmenter(lang, {granularity:"word"}).segment(text)].map(s => s.segment); }catch(e){}
    }
    return text.split(/(\s+)/);
  }

  function wrapText(ctx, text, maxW, lang){
    const out = [];
    for(const para of String(text).split("\n")){
      let line = "";
      for(const tok of segmentWords(para, lang)){
        const test = line + tok;
        if(ctx.measureText(test).width > maxW && line.trim() !== ""){
          out.push(line.trimEnd());
          line = tok.replace(/^\s+/, "");
        }else{
          line = test;
        }
      }
      out.push(line.trimEnd());
    }
    return out;
  }

  // en langue RTL, isole les noms de fichiers latins (ex : 4-H.stl) pour qu'ils ne soient pas inversés
  function fixBidi(str, rtl){
    if(!rtl) return str;
    return String(str).replace(/(\[[A-Za-z]+\]-\[[A-Za-z]+\]\.stl|\d-[A-Z]\.stl)/g, "\u2066$1\u2069");
  }

  function loadImage(src){
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  }

  async function buildPdf(data, imgData, opts){
    const lang = I18N.bcp;
    const rtl = I18N.dir === "rtl";
    const tt = (k, v) => I18N.t(k, v);
    const { jsPDF } = window.jspdf;

    const pages = [];      // canvases
    const links = [];      // {page, x, y, w, h, url}
    let cv, ctx, y;

    function newPage(){
      cv = document.createElement("canvas");
      cv.width = PAGE_W * SCALE; cv.height = PAGE_H * SCALE;
      ctx = cv.getContext("2d");
      ctx.scale(SCALE, SCALE);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
      ctx.textBaseline = "alphabetic";
      pages.push(cv);
      y = M;
    }
    function ensure(h){ if(y + h > PAGE_H - M) newPage(); }

    function setFont(size, bold){ ctx.font = (bold ? "700 " : "400 ") + size + "px " + FONT; }

    // dessine du texte aligné selon la direction de la langue
    function drawLine(text, size, bold, color, indent){
      setFont(size, bold);
      ctx.fillStyle = color || "#111";
      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      const x = rtl ? PAGE_W - M - (indent||0) : M + (indent||0);
      ctx.fillText(text, x, y);
    }

    function paragraph(text, size, bold, color, indent, gap){
      setFont(size, bold);
      const lh = Math.round(size * 1.5);
      const lines = wrapText(ctx, fixBidi(text, rtl), PAGE_W - 2*M - (indent||0), lang);
      for(const l of lines){
        ensure(lh);
        y += size;
        drawLine(l, size, bold, color, indent);
        y += lh - size;
      }
      y += (gap === undefined ? 4 : gap);
    }

    function heading(text){
      ensure(60);
      y += 14;
      paragraph(text, 16, true, "#0b5f7a", 0, 2);
      ctx.fillStyle = "#0b5f7a";
      ctx.fillRect(M, y, PAGE_W - 2*M, 1.5);
      y += 12;
    }

    function bullet(text){ paragraph("•  " + text, 13, false, "#222", 6, 2); }

    // ligne de tableau : cellules à largeurs fixes (ordre inversé en RTL)
    function row(cells, widths, size, bold, color, bg){
      const lh = Math.round(size * 1.9);
      ensure(lh);
      if(bg){ ctx.fillStyle = bg; ctx.fillRect(M, y, PAGE_W - 2*M, lh); }
      setFont(size, bold);
      ctx.fillStyle = color || "#111";
      ctx.direction = rtl ? "rtl" : "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      let off = 0;
      cells.forEach((txt, i) => {
        const x = rtl ? PAGE_W - M - 8 - off : M + 8 + off;
        let s = fixBidi(txt, rtl);
        const maxW = widths[i] - 12;
        while(s.length > 1 && ctx.measureText(s).width > maxW) s = s.slice(0, -1);
        ctx.fillText(s, x, y + lh*0.68);
        off += widths[i];
      });
      y += lh;
    }

    /* ---------- PAGE 1 : titre + plan ---------- */
    newPage();
    ctx.textAlign = "center"; ctx.direction = rtl ? "rtl" : "ltr";
    setFont(26, true); ctx.fillStyle = "#0b2a3a";
    y += 26; ctx.fillText(tt("nTitle"), PAGE_W/2, y); y += 10;
    ctx.fillStyle = "#00bcd4"; ctx.fillRect(PAGE_W/2 - 40, y, 80, 3); y += 22;

    if(opts && opts.creator){
      setFont(13, false); ctx.fillStyle = "#4a5a66"; ctx.textAlign = "center";
      y += 13; ctx.fillText(tt("nCreator", { name: opts.creator }), PAGE_W/2, y); y += 16;
    }

    const img = await loadImage(imgData);
    const iw = PAGE_W - 2*M, ih = iw * img.height / img.width;
    ctx.strokeStyle = "#cfd8dc"; ctx.lineWidth = 1;
    ctx.drawImage(img, M, y, iw, ih);
    ctx.strokeRect(M, y, iw, ih);
    y += ih + 12;

    /* ---------- PIÈCES ---------- */
    heading(tt("nParts"));
    Object.keys(data.partCount).sort().forEach((name, i) => {
      row([name, "× " + data.partCount[name]], [260, 120], 13, false, "#111", i % 2 ? "#f3f7f9" : null);
    });

    heading(tt("nLinks"));
    row([tt("nLink22"), "× " + (data.liaison123 * 2)], [260, 120], 13, false, "#111", "#f3f7f9");
    row([tt("nLink12"), "× " + (data.liaison4 * 2)], [260, 120], 13, false, "#111", null);

    /* ---------- INSTRUCTIONS ---------- */
    heading(tt("nInstr"));
    const wStep = 150, wFile = 200, wPlace = PAGE_W - 2*M - wStep - wFile;
    data.list.forEach((h, i) => {
      row([
        tt("nStep",  { n: h.index }),
        tt("nStl",   { file: h.thickness + "-" + h.type + ".stl" }),
        tt("nPlace", { n: h.index })
      ], [wStep, wFile, wPlace], 12.5, false, "#111", i % 2 ? "#f3f7f9" : null);
    });

    /* ---------- IMPRESSION / ASSEMBLAGE ---------- */
    heading(tt("nPrint"));
    ["nPrint1","nPrint2","nPrint3","nPrint4"].forEach(k => bullet(tt(k)));

    heading(tt("nAsm"));
    ["nAsm1","nAsm2","nAsm3"].forEach(k => bullet(tt(k)));

    /* ---------- PROJET ---------- */
    heading(tt("nProject"));
    paragraph(tt("nProj1"), 14, true, "#111", 0, 2);
    paragraph(tt("nProj2"), 13, false, "#222", 0, 2);
    paragraph(tt("nProj3"), 13, false, "#222", 0, 2);
    paragraph(tt("nProj4"), 13, false, "#222", 0, 8);
    paragraph(tt("nVideo"), 12.5, true, "#111", 0, 4);

    // lien cliquable
    ensure(30);
    y += 16;
    setFont(15, true);
    const label = "Tim_Bricolage";
    ctx.direction = "ltr"; ctx.textAlign = "left";
    const lw = ctx.measureText(label).width;
    const lx = rtl ? PAGE_W - M - lw : M;
    ctx.fillStyle = "#0645ad";
    ctx.fillText(label, lx, y);
    ctx.fillRect(lx, y + 3, lw, 1.2);
    links.push({ page: pages.length - 1, x: lx, y: y - 16, w: lw, h: 22, url: "https://www.youtube.com/@Tim_Bricolage" });

    /* ---------- ASSEMBLAGE DU PDF ---------- */
    const pdf = new jsPDF({ unit:"mm", format:"a4" });
    const k = 210 / PAGE_W;
    pages.forEach((c, i) => {
      if(i > 0) pdf.addPage();
      pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    });
    links.forEach(l => {
      pdf.setPage(l.page + 1);
      pdf.link(l.x * k, l.y * k, l.w * k, l.h * k, { url: l.url });
    });
    return pdf;
  }

  /**
   * Génère et télécharge la notice dans la langue courante.
   * hexes : [{q,r,thickness}] ; opts.creator : nom du créateur (galerie)
   */
  async function downloadNotice(hexes, opts){
    const data = analyze(hexes);
    const imgData = generateNumberedImage(data.list);
    const pdf = await buildPdf(data, imgData, opts);
    pdf.save("Notice Hexalamp.pdf");
  }

  window.Notice = { analyze, downloadNotice, axialToPixel, HEX_DIRS };
})();
