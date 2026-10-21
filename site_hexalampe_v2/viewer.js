/*************************
  HexViewer - rendu 3D (three.js) réutilisable
  Utilisé par le configurateur ET par la galerie.
**************************/
(function(){

  // hauteurs réelles (cm)
  const HEIGHTS = { 1:0.875, 2:1.75, 3:2.624, 4:3.5 };
  const HEIGHT_SCALE = 0.15;

  // matériaux et géométries partagés (créés une seule fois)
  const blackMat = new THREE.MeshStandardMaterial({ color:0x111418, metalness:0.2, roughness:0.4 });
  const whiteMat = new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0xffffff, emissiveIntensity:0.6 });

  const hexShape = (function(){
    const s = new THREE.Shape();
    for(let i=0;i<6;i++){
      const a = Math.PI/3*i + Math.PI/6;
      const x = Math.cos(a), y = Math.sin(a);
      if(i===0) s.moveTo(x,y); else s.lineTo(x,y);
    }
    s.closePath();
    return s;
  })();

  const geoCache = {};
  function extrude(depth){
    const k = depth.toFixed(5);
    if(!geoCache[k]) geoCache[k] = new THREE.ExtrudeGeometry(hexShape, { depth, bevelEnabled:false });
    return geoCache[k];
  }

  const edgeMat = new THREE.LineBasicMaterial({ color:0x3d7a94, transparent:true, opacity:0.75 });
  const edgeCache = {};
  function edgesOf(depth){
    const k = depth.toFixed(5);
    if(!edgeCache[k]) edgeCache[k] = new THREE.EdgesGeometry(extrude(depth));
    return edgeCache[k];
  }

  function slab(depth, mat, y){
    const m = new THREE.Mesh(extrude(depth), mat);
    m.add(new THREE.LineSegments(edgesOf(depth), edgeMat));
    m.rotation.x = -Math.PI/2;
    m.position.y = y;
    return m;
  }

  function createHexMesh(thickness){
    const height = HEIGHTS[thickness] * HEIGHT_SCALE;
    const group = new THREE.Group();
    if(thickness === 4){
      // structure noir / blanc / noir
      const blackBottom = height * 0.45;
      const whiteBand   = height * 0.30;
      const blackTop    = height * 0.25;
      group.add(slab(blackBottom, blackMat, 0));
      group.add(slab(whiteBand,   whiteMat, blackBottom));
      group.add(slab(blackTop,    blackMat, blackBottom + whiteBand));
    }else{
      group.add(slab(height, blackMat, 0));
    }
    return group;
  }

  function hexTo3D(q, r){
    return { x: Math.sqrt(3)*q + Math.sqrt(3)/2*r, z: 3/2*r };
  }

  class HexViewer{
    constructor(container, opts){
      opts = opts || {};
      this.container = container;
      this.scene = new THREE.Scene();

      this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

      this.renderer = new THREE.WebGLRenderer({
        antialias:true, alpha:true,
        preserveDrawingBuffer: !!opts.preserveDrawingBuffer
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(this.renderer.domElement);
      this.dom = this.renderer.domElement;
      this.dom.style.display = "block";
      this.dom.style.touchAction = "none";

      // lumières
      const light = new THREE.DirectionalLight(0xffffff, 1.7);
      light.position.set(10, 20, 10);
      this.scene.add(light);
      this.scene.add(new THREE.AmbientLight(0x5c6875));
      const rim = new THREE.PointLight(0x00cfff, 1.1, 90);
      rim.position.set(-14, 9, 12);
      this.scene.add(rim);

      this.hexGroup = new THREE.Group();
      this.scene.add(this.hexGroup);

      // état caméra (orbite)
      this.theta = Math.PI/4;
      this.phi = Math.PI/3;
      this.radius = 22;
      this.target = new THREE.Vector3(0,0,0);

      this.dirty = true;
      this.alive = true;
      this._bindControls();

      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(container);
      this.resize();

      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    setHexes(list){
      while(this.hexGroup.children.length) this.hexGroup.remove(this.hexGroup.children[0]);
      for(const h of list){
        const pos = hexTo3D(h.q, h.r);
        const mesh = createHexMesh(h.thickness);
        mesh.position.set(pos.x, 0, pos.z);
        this.hexGroup.add(mesh);
      }
      this.dirty = true;
    }

    // cadre automatiquement le modèle
    fit(){
      if(!this.hexGroup.children.length){
        this.target.set(0,0,0); this.radius = 22; this.dirty = true; return;
      }
      let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
      for(const m of this.hexGroup.children){
        minX = Math.min(minX, m.position.x - 1); maxX = Math.max(maxX, m.position.x + 1);
        minZ = Math.min(minZ, m.position.z - 1); maxZ = Math.max(maxZ, m.position.z + 1);
      }
      this.target.set((minX+maxX)/2, 0.2, (minZ+maxZ)/2);
      const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const dx = (maxX-minX) / 2 / (t * this.camera.aspect);
      const dz = (maxZ-minZ) / 2 / t * 0.8;
      this.radius = Math.max(5, Math.min(80, Math.max(dx, dz) * 1.18 + 2));
      this.dirty = true;
    }

    resize(){
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if(!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.dirty = true;
    }

    _updateCamera(){
      const x = this.radius * Math.sin(this.phi) * Math.sin(this.theta);
      const y = this.radius * Math.cos(this.phi);
      const z = this.radius * Math.sin(this.phi) * Math.cos(this.theta);
      this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
      this.camera.lookAt(this.target);
    }

    render(){
      this._updateCamera();
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }

    _loop(){
      if(!this.alive) return;
      requestAnimationFrame(this._loop);
      if(this.dirty && this.container.clientWidth > 0) this.render();
    }

    _pan(dx, dy){
      const s = this.radius * 0.0009;
      const right   = new THREE.Vector3(Math.cos(this.theta), 0, -Math.sin(this.theta));
      const forward = new THREE.Vector3(Math.sin(this.theta), 0,  Math.cos(this.theta));
      this.target.addScaledVector(right, -dx * s);
      this.target.addScaledVector(forward, dy * s);
    }

    _bindControls(){
      const dom = this.dom;
      const pointers = new Map();
      let lastDist = 0, lastMid = null;

      dom.addEventListener("contextmenu", e => e.preventDefault());

      dom.addEventListener("pointerdown", e => {
        dom.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x:e.clientX, y:e.clientY, button:e.button, shift:e.shiftKey });
        if(pointers.size === 2){
          const [a,b] = [...pointers.values()];
          lastDist = Math.hypot(a.x-b.x, a.y-b.y);
          lastMid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
        }
      });

      dom.addEventListener("pointermove", e => {
        const p = pointers.get(e.pointerId);
        if(!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;

        if(pointers.size === 1){
          if(p.button === 2 || p.shift){
            this._pan(dx, dy);
          }else{
            this.theta -= dx * 0.005;
            this.phi   -= dy * 0.005;
            this.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.phi));
          }
        }else if(pointers.size === 2){
          const [a,b] = [...pointers.values()];
          const dist = Math.hypot(a.x-b.x, a.y-b.y);
          const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
          if(lastDist > 0){
            this.radius = Math.max(3, Math.min(80, this.radius * (lastDist / dist)));
          }
          if(lastMid) this._pan(mid.x - lastMid.x, mid.y - lastMid.y);
          lastDist = dist; lastMid = mid;
        }
        this.dirty = true;
      });

      const end = e => { pointers.delete(e.pointerId); lastDist = 0; lastMid = null; };
      dom.addEventListener("pointerup", end);
      dom.addEventListener("pointercancel", end);

      dom.addEventListener("wheel", e => {
        e.preventDefault();
        this.radius = Math.max(3, Math.min(80, this.radius + e.deltaY * 0.01));
        this.dirty = true;
      }, { passive:false });
    }

    destroy(){
      this.alive = false;
      this._ro.disconnect();
      this.renderer.dispose();
      if(this.renderer.forceContextLoss) this.renderer.forceContextLoss();
      if(this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
    }
  }

  // Miniature JPEG (data URL) d'un modèle - utilisée pour la galerie
  function makeThumbnail(hexes, w, h){
    w = w || 360; h = h || 270;
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-9999px;top:0;width:"+w+"px;height:"+h+"px;";
    document.body.appendChild(holder);
    const v = new HexViewer(holder, { preserveDrawingBuffer:true });
    v.renderer.setPixelRatio(1);
    v.renderer.setSize(w, h);
    v.camera.aspect = w / h;
    v.camera.updateProjectionMatrix();
    v.setHexes(hexes);
    v.fit();
    v.theta = Math.PI/5; v.phi = Math.PI/3.2;
    v.render();

    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const c = out.getContext("2d");
    const g = c.createRadialGradient(w/2, h*0.45, 10, w/2, h*0.45, Math.max(w,h)*0.7);
    g.addColorStop(0, "#14405c"); g.addColorStop(1, "#050b12");
    c.fillStyle = g; c.fillRect(0,0,w,h);
    c.drawImage(v.dom, 0, 0, w, h);
    const url = out.toDataURL("image/jpeg", 0.78);

    v.destroy();
    holder.remove();
    return url;
  }

  window.HexViewer = HexViewer;
  window.makeThumbnail = makeThumbnail;
})();
