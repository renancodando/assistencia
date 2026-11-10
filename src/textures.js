// Texturas procedurais — tudo é desenhado em canvas, sem nenhuma imagem externa.
import * as THREE from 'three';

const DISPLAY = '"Archivo Variable", "Archivo", system-ui, sans-serif';
const MARKER = '"Permanent Marker", "Comic Sans MS", cursive';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// PRNG determinístico: a bancada é sempre a mesma a cada visita.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Desenha tudo em um canvas à parte e aplica o desfoque uma única vez
// (filtro por traço é lento demais em CPU).
function blurInto(target, px, paint) {
  const [c, g] = canvas(target.canvas.width, target.canvas.height);
  paint(g);
  target.save();
  target.filter = `blur(${px}px)`;
  target.drawImage(c, 0, 0);
  target.restore();
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function grain(ctx, w, h, amount, seed = 1) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ */
/* Manta de silicone                                                   */
/* ------------------------------------------------------------------ */
export function matTextures(wCm, hCm, size) {
  const W = size;
  const H = Math.round((size * hCm) / wCm);
  const px = W / wCm; // pixels por centímetro
  const [c, g] = canvas(W, H);
  const r = rng(7);

  g.fillStyle = '#2f5470';
  g.fillRect(0, 0, W, H);

  // manchas largas: silicone nunca é uniforme
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * H, rad = (2 + r() * 9) * px;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() > 0.5;
    gr.addColorStop(0, dark ? 'rgba(20,32,44,0.10)' : 'rgba(120,150,170,0.07)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  const ink = (a) => `rgba(226,234,238,${a})`;
  const cm = (v) => v * px;
  const ox = W / 2, oy = H / 2; // origem no centro, como a cena

  // malha de 1 cm e 5 cm
  g.lineWidth = Math.max(1, px * 0.018);
  for (let x = -Math.floor(wCm / 2) + 2; x <= wCm / 2 - 2; x++) {
    g.strokeStyle = ink(x % 5 === 0 ? 0.3 : 0.1);
    g.beginPath();
    g.moveTo(ox + cm(x), cm(2.4));
    g.lineTo(ox + cm(x), H - cm(2.4));
    g.stroke();
  }
  for (let y = -Math.floor(hCm / 2) + 3; y <= hCm / 2 - 3; y++) {
    g.strokeStyle = ink(y % 5 === 0 ? 0.3 : 0.1);
    g.beginPath();
    g.moveTo(cm(2), oy + cm(y));
    g.lineTo(W - cm(2), oy + cm(y));
    g.stroke();
  }

  // régua na borda de baixo
  g.fillStyle = ink(0.85);
  g.strokeStyle = ink(0.85);
  g.font = `600 ${px * 0.42}px ${DISPLAY}`;
  g.textAlign = 'center';
  for (let mm = 0; mm <= (wCm - 6) * 10; mm++) {
    const x = cm(3) + (mm / 10) * px;
    const len = mm % 10 === 0 ? 0.7 : mm % 5 === 0 ? 0.48 : 0.28;
    g.lineWidth = Math.max(1, px * (mm % 10 === 0 ? 0.03 : 0.018));
    g.beginPath();
    g.moveTo(x, H - cm(1.1));
    g.lineTo(x, H - cm(1.1 + len));
    g.stroke();
    if (mm % 10 === 0) g.fillText(String(mm / 10), x, H - cm(0.45));
  }

  // marca serigrafada no canto
  g.textAlign = 'left';
  g.font = `800 ${px * 1.15}px ${DISPLAY}`;
  if ('fontStretch' in g) g.fontStretch = 'expanded';
  g.fillStyle = ink(0.9);
  g.fillText('Reparo Fino', cm(3), cm(2.0));
  if ('fontStretch' in g) g.fontStretch = 'normal';
  g.font = `500 ${px * 0.42}px ${DISPLAY}`;
  g.fillStyle = ink(0.7);
  g.fillText('manta antiestática de bancada  ·  resiste a 500 °C  ·  modelo RF-70', cm(3), cm(2.75));

  // bandeja de parafusos serigrafada (onde os pentalobe pousam)
  const tx = ox + cm(5.2), ty = oy + cm(9.6);
  g.lineWidth = Math.max(1.5, px * 0.035);
  g.strokeStyle = ink(0.75);
  g.font = `600 ${px * 0.34}px ${DISPLAY}`;
  g.fillStyle = ink(0.75);
  const cells = ['pentalobe', 'tri-point', 'phillips', 'blindagem', 'conector', 'sobra: 0'];
  cells.forEach((label, i) => {
    const x = tx + (i % 3) * cm(3.1), y = ty + Math.floor(i / 3) * cm(2.3);
    rr(g, x, y, cm(2.8), cm(2.0), cm(0.25));
    g.stroke();
    g.fillText(label, x + cm(0.2), y + cm(1.8));
  });

  // contorno de onde o aparelho deita
  g.setLineDash([cm(0.3), cm(0.22)]);
  g.strokeStyle = ink(0.35);
  rr(g, ox - cm(4.4), oy - cm(8.2), cm(8.8), cm(16.4), cm(1.6));
  g.stroke();
  g.setLineDash([]);

  // poeira, fiapos e marcas de uso
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(235,240,245,${0.05 + r() * 0.25})`;
    const s = r() * px * 0.035 + 0.5;
    g.fillRect(r() * W, r() * H, s, s);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(230,236,240,${0.06 + r() * 0.12})`;
    g.lineWidth = 0.6 + r() * 0.8;
    const x = r() * W, y = r() * H, a = r() * 6.28, l = px * (0.2 + r() * 0.9);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + (r() - 0.5) * l,
      y + Math.sin(a) * l * 0.5 + (r() - 0.5) * l,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l
    );
    g.stroke();
  }
  // riscos de estilete e queimaduras de ferro de solda
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(18,28,38,${0.12 + r() * 0.2})`;
    g.lineWidth = 0.8 + r() * 1.2;
    const x = r() * W, y = r() * H, a = r() * 6.28, l = px * (1 + r() * 5);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = r() * H, rad = px * (0.12 + r() * 0.25);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(15,12,10,0.55)');
    gr.addColorStop(0.6, 'rgba(60,45,30,0.2)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // microtextura do silicone (relevo), repetida
  const [bc, bg] = canvas(512, 512);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, 512, 512);
  grain(bg, 512, 512, 90, 3);

  return {
    map: tex(c, { aniso: 16 }),
    bump: tex(bc, { srgb: false, repeat: [wCm / 3.5, hCm / 3.5] }),
  };
}

export function benchTexture() {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#14181c';
  g.fillRect(0, 0, 1024, 1024);
  const r = rng(11);
  for (let i = 0; i < 1400; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.015 + r() * 0.03})`;
    g.lineWidth = 0.5 + r() * 1.5;
    const y = r() * 1024, x = r() * 1024, l = 60 + r() * 420;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l, y + (r() - 0.5) * 3);
    g.stroke();
  }
  grain(g, 1024, 1024, 10, 5);
  return tex(c, { repeat: [6, 6] });
}

/* ------------------------------------------------------------------ */
/* Trinca procedural                                                   */
/* ------------------------------------------------------------------ */
function crackPaths(W, H, seed) {
  const r = rng(seed);
  const segs = []; // {pts:[[x,y]...], w}
  const impacts = [
    { x: 0.8 * W, y: 0.085 * H, rays: 23, reach: 1.6 },
    { x: 0.2 * W, y: 0.83 * H, rays: 11, reach: 0.42 },
  ];
  for (const im of impacts) {
    const rays = [];
    const n = im.rays;
    const maxR = H * im.reach;
    const radii = [];
    for (let rad = H * 0.008; rad < maxR; rad *= 1.42 + r() * 0.25) radii.push(rad);
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.22;
      const pts = [[im.x, im.y]];
      const stopAt = r() < 0.3 ? Math.floor(radii.length * (0.35 + r() * 0.4)) : radii.length;
      for (let k = 0; k < stopAt; k++) {
        a += (r() - 0.5) * 0.13;
        const x = im.x + Math.cos(a) * radii[k], y = im.y + Math.sin(a) * radii[k];
        pts.push([x, y]);
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) break;
      }
      rays.push(pts);
      segs.push({ pts, w: 1.2 + r() * 1.6 });
      // ramificação
      if (r() < 0.45 && pts.length > 4) {
        const from = pts[2 + Math.floor(r() * (pts.length - 3))];
        let ba = a + (r() > 0.5 ? 1 : -1) * (0.35 + r() * 0.5);
        const bp = [from];
        let bx = from[0], by = from[1];
        const steps = 3 + Math.floor(r() * 5);
        for (let s = 0; s < steps; s++) {
          ba += (r() - 0.5) * 0.3;
          bx += Math.cos(ba) * H * 0.03;
          by += Math.sin(ba) * H * 0.03;
          bp.push([bx, by]);
        }
        segs.push({ pts: bp, w: 0.8 + r() });
      }
    }
    // anéis: ligam raios vizinhos e formam os cacos
    for (let k = 1; k < radii.length; k++) {
      const density = k < 5 ? 0.85 : 0.42;
      for (let i = 0; i < n; i++) {
        const A = rays[i], B = rays[(i + 1) % n];
        if (r() > density || !A[k] || !B[k]) continue;
        const ka = Math.max(1, k - (r() < 0.3 ? 1 : 0));
        if (!A[ka]) continue;
        segs.push({ pts: [A[ka], B[k]], w: 0.7 + r() * 1.1 });
      }
    }
  }
  return { segs, impacts };
}

function strokeCracks(g, segs, style, scale = 1) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const s of segs) {
    g.strokeStyle = style;
    g.lineWidth = s.w * scale;
    g.beginPath();
    s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

function smudges(g, W, H, seed, strength) {
  // marcas de dedo: é o que faz um vidro parecer usado
  const r = rng(seed);
  for (let i = 0; i < 16; i++) {
    const x = r() * W, y = r() * H;
    const rx = W * (0.05 + r() * 0.08), ry = rx * (1.2 + r() * 0.6);
    g.save();
    g.translate(x, y);
    g.rotate(r() * 3.14);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    gr.addColorStop(0, `rgba(255,255,255,${strength * (0.5 + r() * 0.5)})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.scale(rx / ry, 1);
    g.beginPath();
    g.arc(0, 0, ry, 0, 6.3);
    g.fill();
    // cristas da digital
    g.strokeStyle = `rgba(255,255,255,${strength * 0.5})`;
    g.lineWidth = 1.2;
    for (let k = 3; k < 14; k++) {
      g.beginPath();
      g.arc(0, ry * 0.25, (ry * k) / 15, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.restore();
  }
  // rastro de deslizar o dedo
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(255,255,255,${strength * 0.35})`;
    g.lineWidth = W * 0.05;
    g.lineCap = 'round';
    g.beginPath();
    const x = W * (0.2 + r() * 0.6), y = H * (0.3 + r() * 0.6);
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * W * 0.5, y - H * 0.1, x + (r() - 0.5) * W * 0.3, y - H * 0.25);
    g.stroke();
  }
}

// Superfície do vidro: cor (riscos claros), rugosidade e relevo.
export function glassSurface({ cracked }) {
  const W = 1024, H = 2158;
  const { segs, impacts } = crackPaths(W, H, 42);

  const [cc, cg] = canvas(W, H); // cor
  cg.fillStyle = '#020203';
  cg.fillRect(0, 0, W, H);

  const [rc, rg] = canvas(W, H); // rugosidade (canal G)
  rg.fillStyle = 'rgb(9,9,9)';
  rg.fillRect(0, 0, W, H);
  smudges(rg, W, H, cracked ? 5 : 9, cracked ? 0.16 : 0.07);

  const [bc, bg] = canvas(W, H); // relevo
  bg.fillStyle = '#000';
  bg.fillRect(0, 0, W, H);

  if (cracked) {
    blurInto(cg, 1.2, (g) => strokeCracks(g, segs, 'rgba(170,185,200,0.20)', 2.2));
    strokeCracks(cg, segs, 'rgba(225,235,245,0.5)', 0.8);
    strokeCracks(rg, segs, 'rgba(255,255,255,0.9)', 1.5);
    blurInto(bg, 1, (g) => strokeCracks(g, segs, '#fff', 2.0));
    // vidro moído no ponto de impacto
    const r = rng(77);
    for (const im of impacts) {
      for (let i = 0; i < 420; i++) {
        const a = r() * 6.28, d = Math.pow(r(), 2) * H * 0.035;
        const x = im.x + Math.cos(a) * d, y = im.y + Math.sin(a) * d, s = 1 + r() * 3;
        cg.fillStyle = `rgba(230,238,245,${0.25 + r() * 0.5})`;
        cg.fillRect(x, y, s, s);
        rg.fillStyle = '#fff';
        rg.fillRect(x, y, s, s);
        bg.fillStyle = `rgba(255,255,255,${r()})`;
        bg.fillRect(x, y, s, s);
      }
    }
  }
  return {
    map: tex(cc),
    rough: tex(rc, { srgb: false }),
    bump: tex(bc, { srgb: false }),
    segs,
    impacts,
    W,
    H,
  };
}

/* ------------------------------------------------------------------ */
/* Tela (OLED) — relógio de verdade, defeito de verdade                */
/* ------------------------------------------------------------------ */
export class ScreenCanvas {
  constructor({ broken, crack }) {
    this.W = 720;
    this.H = 1518;
    [this.c, this.g] = canvas(this.W, this.H);
    this.broken = broken;
    this.texture = tex(this.c);
    this.r = rng(broken ? 21 : 22);
    this.inset = 20; // moldura preta do vidro
    this.wall = this.paintWallpaper();
    if (broken) this.damage = this.paintDamage(crack);
    this.lastKey = '';
    this.message = null;
    this.draw(true);
  }

  paintWallpaper() {
    const { W, H } = this;
    const [c, g] = canvas(W, H);
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1b3a');
    sky.addColorStop(0.38, '#3c2f6b');
    sky.addColorStop(0.62, '#c4513f');
    sky.addColorStop(0.78, '#f0a35a');
    sky.addColorStop(1, '#1a1020');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // sol baixo
    const sun = g.createRadialGradient(W * 0.36, H * 0.7, 0, W * 0.36, H * 0.7, W * 0.7);
    sun.addColorStop(0, 'rgba(255,236,190,0.95)');
    sun.addColorStop(0.12, 'rgba(255,190,110,0.55)');
    sun.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // serras em camadas
    const r = rng(4);
    const layers = ['#6b3550', '#4a2646', '#2c1a38', '#150f22'];
    layers.forEach((col, i) => {
      const base = H * (0.7 + i * 0.07);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, H);
      g.lineTo(0, base);
      let x = 0;
      while (x < W) {
        const step = 40 + r() * 110;
        g.quadraticCurveTo(x + step / 2, base - (30 + r() * 90) * (1 - i * 0.15), x + step, base + (r() - 0.5) * 40);
        x += step;
      }
      g.lineTo(W, H);
      g.fill();
    });
    grain(g, W, H, 9, 8);
    return c;
  }

  paintDamage(crack) {
    const { W, H } = this;
    const [c, g] = canvas(W, H);
    const r = rng(31);
    const sx = W / crack.W, sy = H / crack.H;
    const im = crack.impacts[0];
    const ix = im.x * sx, iy = im.y * sy;

    // tinta do OLED vazando a partir do impacto
    const blob = (g, style, grow) => {
      g.fillStyle = style;
      const rr2 = rng(90);
      for (let i = 0; i < 26; i++) {
        const a = rr2() * 6.28, d = rr2() * W * 0.13;
        const x = ix + Math.cos(a) * d, y = iy + Math.sin(a) * d;
        g.beginPath();
        g.arc(x, y, W * (0.03 + rr2() * 0.05) + grow, 0, 6.3);
        g.fill();
      }
      // a mancha escorre pela trinca principal
      g.beginPath();
      g.moveTo(ix + W * 0.02, iy);
      g.quadraticCurveTo(ix + W * 0.07, iy + H * 0.2, ix + W * 0.13, iy + H * 0.4);
      g.lineTo(ix + W * 0.3, iy + H * 0.36);
      g.lineTo(ix + W * 0.3, iy);
      g.fill();
    };
    blurInto(g, 14, (x) => blob(x, 'rgba(70,40,220,0.85)', 18));
    blurInto(g, 7, (x) => blob(x, 'rgba(160,60,255,0.9)', 8));
    blurInto(g, 2.5, (x) => blob(x, '#000', 0));

    // segundo impacto: pixels mortos
    const im2 = crack.impacts[1];
    g.filter = 'blur(5px)';
    g.fillStyle = 'rgba(40,220,120,0.5)';
    g.beginPath();
    g.ellipse(im2.x * sx, im2.y * sy, W * 0.09, W * 0.07, 0.4, 0, 6.3);
    g.fill();
    g.filter = 'blur(2px)';
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(im2.x * sx, im2.y * sy, W * 0.065, W * 0.045, 0.4, 0, 6.3);
    g.fill();
    g.filter = 'none';

    // linhas verticais: colunas do painel em curto
    this.lines = [];
    const cols = ['#3dff78', '#ff3fd0', '#ffffff', '#3dff78', '#36c8ff', '#ff3fd0', '#3dff78'];
    cols.forEach((col, i) => {
      this.lines.push({
        x: Math.round(W * (0.06 + r() * 0.5)),
        w: r() < 0.3 ? 3 : 1.5,
        col,
        from: r() < 0.4 ? H * r() * 0.4 : 0,
        phase: r() * 10,
      });
    });
    // faixa esverdeada
    const band = g.createLinearGradient(W * 0.5, 0, W, 0);
    band.addColorStop(0, 'rgba(60,255,150,0)');
    band.addColorStop(1, 'rgba(60,255,150,0.16)');
    g.fillStyle = band;
    g.fillRect(0, 0, W, H);
    return c;
  }

  // Redesenha só quando o minuto muda — ou a cada quadro de falha.
  draw(force = false, t = 0) {
    const now = new Date();
    const key = `${now.getHours()}:${now.getMinutes()}`;
    const glitch = this.broken && Math.sin(t * 1.7) + Math.sin(t * 4.3) > 1.55;
    if (!force && key === this.lastKey && !this.broken) return;
    if (!force && key === this.lastKey && this.broken && !glitch && !this.wasGlitch && Math.floor(t * 6) === this.lastTick) return;
    this.lastTick = Math.floor(t * 6);
    this.wasGlitch = glitch;
    this.lastKey = key;

    const { g, W, H, inset } = this;
    g.save();
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    rr(g, inset, inset, W - inset * 2, H - inset * 2, 86);
    g.clip();
    g.drawImage(this.wall, 0, 0);

    // barra de status
    g.fillStyle = '#fff';
    g.font = `600 30px ${DISPLAY}`;
    g.textAlign = 'left';
    g.fillText('Vivo', 70, 84);
    // ilha da câmera
    g.fillStyle = '#000';
    rr(g, W / 2 - 100, 46, 200, 56, 28);
    g.fill();
    g.fillStyle = '#0c1020';
    g.beginPath();
    g.arc(W / 2 + 62, 74, 11, 0, 6.3);
    g.fill();
    // bateria
    const low = this.broken;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2.5;
    rr(g, W - 132, 60, 56, 28, 8);
    g.stroke();
    g.fillStyle = low ? '#ff453a' : '#fff';
    rr(g, W - 128, 64, low ? 9 : 48, 20, 5);
    g.fill();
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) g.fillRect(W - 226 + i * 11, 84 - 8 - i * 5, 7, 8 + i * 5);

    // data e hora reais
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = `500 38px ${DISPLAY}`;
    const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    g.fillText(date, W / 2, 232);
    g.font = `700 196px ${DISPLAY}`;
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    g.fillText(`${hh}:${mm}`, W / 2, 410);

    // notificações
    const cards = this.broken
      ? [
          ['Mãe', 'Filho, conseguiu arrumar o celular?', 'agora'],
          ['Bateria fraca', 'Restam 9% de carga.', 'há 4 min'],
          ['Banco', 'Não foi possível confirmar sua digital.', 'há 12 min'],
        ]
      : [
          ['Reparo Fino', this.message || 'Seu aparelho está pronto. Garantia de 90 dias.', 'agora'],
          ['Mãe', 'Aleluia! Agora atende quando eu ligar.', 'há 1 min'],
        ];
    cards.forEach(([title, body, when], i) => {
      const y = H - 520 + i * 132 - (cards.length - 2) * 66;
      g.fillStyle = 'rgba(245,240,255,0.2)';
      rr(g, 52, y, W - 104, 116, 32);
      g.fill();
      g.fillStyle = i === 0 && !this.broken ? '#e0962a' : 'rgba(255,255,255,0.85)';
      rr(g, 76, y + 26, 64, 64, 16);
      g.fill();
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      g.font = `700 30px ${DISPLAY}`;
      g.fillText(title, 164, y + 50);
      g.font = `400 28px ${DISPLAY}`;
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillText(body, 164, y + 90, W - 104 - 136);
      g.textAlign = 'right';
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = `400 24px ${DISPLAY}`;
      g.fillText(when, W - 80, y + 50);
    });

    // lanterna, câmera e barra inferior
    g.fillStyle = 'rgba(20,20,30,0.45)';
    [112, W - 112].forEach((x) => {
      g.beginPath();
      g.arc(x, H - 130, 50, 0, 6.3);
      g.fill();
    });
    g.fillStyle = 'rgba(255,255,255,0.9)';
    rr(g, W / 2 - 130, H - 58, 260, 9, 5);
    g.fill();

    if (this.broken) {
      // falha: uma fatia da imagem desloca de lado
      if (glitch) {
        const y = 300 + ((t * 977) % 700), h = 30 + ((t * 311) % 120);
        g.drawImage(this.c, 0, y, W, h, 14 + ((t * 53) % 22), y, W, h);
        g.fillStyle = 'rgba(80,255,160,0.08)';
        g.fillRect(0, y, W, h);
      }
      g.drawImage(this.damage, 0, 0);
      for (const l of this.lines) {
        const a = 0.55 + 0.45 * Math.sin(t * 9 + l.phase) * Math.sin(t * 2.3 + l.phase * 2);
        g.globalAlpha = Math.max(0.25, a);
        g.fillStyle = l.col;
        g.fillRect(l.x, l.from, l.w, H);
        g.globalAlpha = Math.max(0.05, a * 0.25);
        g.fillRect(l.x - 3, l.from, l.w + 6, H);
      }
      g.globalAlpha = 1;
    }
    g.restore();
    this.texture.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Peças internas                                                      */
/* ------------------------------------------------------------------ */
export function batteryTexture() {
  const W = 640, H = 1378;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#0b0b0d';
  g.fillRect(0, 0, W, H);
  // vincos da bolsa
  const r = rng(13);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`;
    g.lineWidth = 2 + r() * 6;
    g.beginPath();
    g.moveTo(r() * W, 0);
    g.lineTo(r() * W, H);
    g.stroke();
  }
  g.fillStyle = '#d7d9dc';
  g.textAlign = 'left';
  g.font = `700 44px ${DISPLAY}`;
  g.fillText('Bateria de íon-lítio', 48, 140);
  g.font = `500 30px ${DISPLAY}`;
  g.fillStyle = '#a9adb3';
  ['3,87 V ⎓ 17,11 Wh  ·  4422 mAh', 'Modelo RF-A2866  ·  célula certificada', 'Tensão limite de carga: 4,48 V'].forEach((t, i) =>
    g.fillText(t, 48, 196 + i * 42)
  );
  g.font = `400 22px ${DISPLAY}`;
  g.fillStyle = '#7d8187';
  const legal = [
    'ATENÇÃO: risco de incêndio e queimaduras. Não perfure, não',
    'amasse, não aqueça acima de 60 °C nem descarte no lixo comum.',
    'Substituição somente por técnico qualificado.',
    'Lote 24-1187-C  ·  Fabricado em 08/2025',
  ];
  legal.forEach((t, i) => g.fillText(t, 48, 360 + i * 32));

  // pictogramas
  const px = 48, py = 540;
  g.strokeStyle = '#a9adb3';
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const x = px + i * 86;
    g.strokeRect(x, py, 64, 64);
    g.beginPath();
    if (i === 0) {
      g.moveTo(x + 8, py + 56);
      g.lineTo(x + 56, py + 8);
    } else if (i === 1) {
      g.arc(x + 32, py + 32, 20, 0, 6.3);
    } else if (i === 2) {
      g.moveTo(x + 32, py + 10);
      g.lineTo(x + 54, py + 52);
      g.lineTo(x + 10, py + 52);
      g.closePath();
    } else if (i === 3) {
      g.moveTo(x + 12, py + 32);
      g.lineTo(x + 52, py + 32);
      g.moveTo(x + 32, py + 12);
      g.lineTo(x + 32, py + 52);
    } else {
      g.rect(x + 18, py + 14, 28, 38);
    }
    g.stroke();
  }
  // código 2D
  const q = rng(99);
  const qs = 7, qn = 24, qx = W - 48 - qs * qn, qy = 660;
  g.fillStyle = '#c9ccd0';
  for (let y = 0; y < qn; y++)
    for (let x = 0; x < qn; x++) if (q() > 0.5 || x === 0 || y === qn - 1) g.fillRect(qx + x * qs, qy + y * qs, qs, qs);
  g.font = `500 24px ${DISPLAY}`;
  g.fillStyle = '#8b8f95';
  g.fillText('F8Y2417RF0QJ', 48, 700);
  g.fillText('821-04417-A', 48, 734);

  // etiqueta da assistência
  g.save();
  g.translate(60, 960);
  g.rotate(-0.03);
  g.fillStyle = '#e8dcb8';
  g.fillRect(0, 0, 400, 150);
  g.fillStyle = '#1b2a3a';
  g.font = `34px ${MARKER}`;
  g.fillText('saúde: 71%', 22, 58);
  g.fillText('trocar ✓', 22, 112);
  g.restore();

  // fita de puxar
  g.fillStyle = '#16171a';
  g.fillRect(0, H - 120, W, 120);
  g.fillStyle = '#5a5e64';
  g.font = `500 24px ${DISPLAY}`;
  g.fillText('puxe as fitas adesivas devagar, no sentido da seta  ▸▸▸', 48, H - 52);
  grain(g, W, H, 8, 2);
  return tex(c);
}

function chip(g, x, y, w, h, label, r) {
  g.fillStyle = '#1a1b1e';
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = 'rgba(200,205,210,0.5)';
  g.font = `500 ${Math.max(7, Math.min(w, h) * 0.16)}px ${DISPLAY}`;
  g.textAlign = 'center';
  label.split('\n').forEach((t, i, arr) => g.fillText(t, x + w / 2, y + h / 2 + (i - (arr.length - 1) / 2) * h * 0.2));
  g.fillStyle = 'rgba(210,215,220,0.5)';
  g.beginPath();
  g.arc(x + 6, y + h - 6, 2, 0, 6.3);
  g.fill();
}

export function boardTexture(wCm, lCm) {
  const s = 190; // px por cm: a macro chega muito perto
  const W = Math.round(wCm * s), H = Math.round(lCm * s);
  const [c, g] = canvas(W, H);
  const r = rng(17);
  g.fillStyle = '#0a1614';
  g.fillRect(0, 0, W, H);
  // trilhas
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(30,70,62,${0.3 + r() * 0.4})`;
    g.lineWidth = 1 + r() * 1.5;
    let x = r() * W, y = r() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const d = (10 + r() * 60) * (r() > 0.5 ? 1 : -1);
      if (k % 2) x += d;
      else y += d;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // vias e pontos de teste dourados
  for (let i = 0; i < 520; i++) {
    const x = r() * W, y = r() * H, rad = 1.2 + r() * 2.6;
    g.fillStyle = r() > 0.3 ? '#c9a24a' : '#8e9aa0';
    g.beginPath();
    g.arc(x, y, rad, 0, 6.3);
    g.fill();
  }
  // componentes SMD
  for (let i = 0; i < 700; i++) {
    const x = r() * W, y = r() * H;
    const horiz = r() > 0.5;
    const w = (horiz ? 9 : 5) * (0.7 + r() * 0.8), h = (horiz ? 5 : 9) * (0.7 + r() * 0.8);
    const kind = r();
    g.fillStyle = '#b9bcc0';
    g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
    g.fillStyle = kind < 0.45 ? '#7a5a3c' : kind < 0.8 ? '#16171a' : '#b8a888';
    if (horiz) g.fillRect(x + 1.5, y - 1.5, w - 3, h + 3);
    else g.fillRect(x - 1.5, y + 1.5, w + 3, h - 3);
  }
  // CIs grandes (ficam sob as blindagens)
  const chips = [
    [0.12, 0.05, 0.7, 0.085, 'RF A18\nAP 8GB'],
    [0.1, 0.165, 0.5, 0.05, 'PMIC\n338S01119'],
    [0.14, 0.26, 0.62, 0.075, 'NAND\n256 GB'],
    [0.5, 0.36, 0.38, 0.04, 'U2\n1616A0'],
    [0.1, 0.44, 0.55, 0.06, 'BASEBAND\nSDX71M'],
    [0.2, 0.56, 0.5, 0.04, 'AUDIO\n338S00537'],
    [0.12, 0.68, 0.34, 0.03, 'NFC'],
    [0.5, 0.74, 0.36, 0.04, 'Wi-Fi/BT'],
    [0.15, 0.86, 0.6, 0.05, 'CARGA\nSN2611'],
  ];
  chips.forEach(([x, y, w, h, l]) => chip(g, x * W, y * H, w * W, h * H, l, r));
  // conectores FPC
  [[0.05, 0.225], [0.55, 0.225], [0.08, 0.52], [0.52, 0.63], [0.08, 0.8]].forEach(([x, y]) => {
    g.fillStyle = '#17181a';
    g.fillRect(x * W, y * H, W * 0.36, H * 0.018);
    g.fillStyle = '#c9a24a';
    for (let k = 0; k < 14; k++) g.fillRect(x * W + 4 + (k * (W * 0.36 - 8)) / 14, y * H + 2, 3, H * 0.018 - 4);
  });
  // serigrafia
  g.fillStyle = 'rgba(220,225,225,0.55)';
  g.font = `500 9px ${DISPLAY}`;
  g.textAlign = 'left';
  for (let i = 0; i < 60; i++) g.fillText(`${'CRULQ'[Math.floor(r() * 5)]}${Math.floor(r() * 4800)}`, r() * W, r() * H);
  g.font = `600 12px ${DISPLAY}`;
  g.fillText('820-03171-A', W * 0.08, H * 0.985);
  return tex(c, { aniso: 16 });
}

export function floorTexture() {
  // fundo do chassi: grafite, bobina de carga sem fio, fitas adesivas
  const W = 720, H = 1540;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#131416';
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 14, 6);
  const cx = W * 0.44, cy = H * 0.52;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = i % 2 ? '#b8693a' : '#8f4b26';
    g.lineWidth = 3.4;
    g.beginPath();
    g.arc(cx, cy, 90 + i * 5.2, 0, 6.3);
    g.stroke();
  }
  g.strokeStyle = '#9a5a30';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(cx + 222, cy);
  g.lineTo(W * 0.86, cy - 180);
  g.stroke();
  // fitas de liberação por estiramento
  g.fillStyle = '#a9a79f';
  [0.2, 0.36, 0.52, 0.66].forEach((x) => g.fillRect(W * x, H * 0.3, 46, H * 0.5));
  g.fillStyle = '#1b1c1f';
  g.font = `600 20px ${DISPLAY}`;
  g.save();
  g.translate(W * 0.2 + 30, H * 0.78);
  g.rotate(-Math.PI / 2);
  g.fillText('▸ puxar', 0, 0);
  g.restore();
  // ímãs
  g.fillStyle = '#2a2c30';
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * 6.28;
    g.save();
    g.translate(cx + Math.cos(a) * 262, cy + Math.sin(a) * 262);
    g.rotate(a);
    g.fillRect(-9, -22, 18, 44);
    g.restore();
  }
  return tex(c);
}

export function displayBackTexture() {
  const W = 720, H = 1518;
  const [c, g] = canvas(W, H);
  const r = rng(19);
  const steel = g.createLinearGradient(0, 0, W, 0);
  steel.addColorStop(0, '#7f858b');
  steel.addColorStop(0.5, '#a3a9ae');
  steel.addColorStop(1, '#787e84');
  g.fillStyle = steel;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = `rgba(255,255,255,${r() * 0.05})`;
    g.beginPath();
    const y = r() * H;
    g.moveTo(0, y);
    g.lineTo(W, y + (r() - 0.5) * 4);
    g.stroke();
  }
  // filme de grafite
  g.fillStyle = '#17181b';
  rr(g, 60, 150, W - 120, H - 520, 30);
  g.fill();
  // flex do painel
  g.fillStyle = '#b97a1e';
  rr(g, 130, H - 360, 250, 230, 16);
  g.fill();
  g.fillStyle = '#8f5d14';
  for (let i = 0; i < 16; i++) g.fillRect(146 + i * 14, H - 350, 5, 210);
  g.fillStyle = '#c9a24a';
  g.fillRect(170, H - 190, 170, 34);
  g.fillStyle = '#17181b';
  rr(g, 420, H - 330, 200, 120, 10);
  g.fill();
  chip(g, 450, H - 310, 130, 80, 'DRIVER\nOLED', r);
  // etiqueta
  g.fillStyle = '#f2f2ee';
  g.fillRect(110, 220, 240, 110);
  g.fillStyle = '#111';
  g.font = `600 22px ${DISPLAY}`;
  g.textAlign = 'left';
  g.fillText('Painel OLED 6,3"', 124, 256);
  g.font = `400 18px ${DISPLAY}`;
  g.fillText('GH82-31245A · rev. C', 124, 284);
  g.fillText('2622 × 1206 · 120 Hz', 124, 308);
  return tex(c);
}

// Fita crepe com anotação do técnico
export function tapeTexture(text, w = 512, h = 128) {
  const [c, g] = canvas(w, h);
  const r = rng(text.length * 7);
  g.fillStyle = '#e6d7b0';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(120,95,50,${r() * 0.08})`;
    g.lineWidth = 1;
    const y = r() * h;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y + (r() - 0.5) * 3);
    g.stroke();
  }
  // pontas rasgadas
  g.globalCompositeOperation = 'destination-out';
  for (const side of [0, 1]) {
    g.beginPath();
    g.moveTo(side ? w : 0, 0);
    for (let y = 0; y <= h; y += 6) g.lineTo(side ? w - 3 - r() * 9 : 3 + r() * 9, y);
    g.lineTo(side ? w : 0, h);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#17263a';
  g.font = `${h * 0.5}px ${MARKER}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4, w - 40);
  return tex(c);
}
