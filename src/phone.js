// O aparelho: cada peça é um objeto separado, porque o site inteiro é desmontá-lo.
import * as THREE from 'three';
import {
  ScreenCanvas,
  glassSurface,
  batteryTexture,
  boardTexture,
  floorTexture,
  displayBackTexture,
} from './textures.js';

const PI = Math.PI;
export const DIM = { W: 7.16, L: 14.76, T: 0.8, R: 1.18 };

function rrShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, PI / 2, PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, PI, PI * 1.5, false);
  return s;
}

// Placa com cantos arredondados deitada no plano XZ, de y=0 até y=t.
export function slab(w, l, t, r, bevel = 0, hole = null) {
  const shape = rrShape(w - bevel * 2, l - bevel * 2, Math.max(0.01, r - bevel));
  if (hole) shape.holes.push(rrShape(hole.w, hole.l, hole.r));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: t - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  });
  geo.rotateX(-PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

// Face plana com UV normalizado (0..1), virada para cima ou para baixo.
export function face(w, l, r, up = true) {
  const geo = new THREE.ShapeGeometry(rrShape(w, l, r), 24);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / l + 0.5);
  geo.rotateX(up ? -PI / 2 : PI / 2);
  return geo;
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export function buildPhone() {
  const { W, L, T, R } = DIM;
  const M = {
    titanium: std({ color: 0x8e8a83, metalness: 1, roughness: 0.36 }),
    steel: std({ color: 0xb4b8bc, metalness: 1, roughness: 0.3 }),
    steelDark: std({ color: 0x55585c, metalness: 1, roughness: 0.42 }),
    black: std({ color: 0x0b0b0d, metalness: 0, roughness: 0.55 }),
    rubber: std({ color: 0x08080a, metalness: 0, roughness: 0.85 }),
    gold: std({ color: 0xd2a94e, metalness: 1, roughness: 0.3 }),
    kapton: new THREE.MeshPhysicalMaterial({ color: 0xc9801c, metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
    flex: std({ color: 0x101113, metalness: 0.2, roughness: 0.4 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x05060a, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 }),
  };

  const phone = new THREE.Group();
  const parts = {};

  // sombra de contato: escurece a manta rente à carcaça
  {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const g = c.getContext('2d');
    g.filter = 'blur(18px)';
    g.fillStyle = '#000';
    g.beginPath();
    g.roundRect(48, 48, 160, 416, 34);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry((W * 256) / 160, (L * 512) / 416),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false })
    );
    sh.rotation.x = -PI / 2;
    sh.position.y = 0.006;
    phone.add(sh);
  }

  /* --- chassi ---------------------------------------------------- */
  const body = new THREE.Group();
  phone.add(body);
  body.add(mesh(slab(W, L, T, R, 0.07, { w: W - 0.44, l: L - 0.44, r: R - 0.22 }), M.titanium));
  // botões e frisos de antena
  [[-W / 2 - 0.01, -2.6, 1.0], [-W / 2 - 0.01, -1.2, 1.0], [W / 2 + 0.01, -1.9, 1.7]].forEach(([x, z, len]) => {
    const b = mesh(new THREE.BoxGeometry(0.07, 0.26, len), M.titanium);
    b.position.set(x, T / 2, z);
    body.add(b);
  });
  [[-2.2, -L / 2], [2.2, L / 2], [-2.2, L / 2]].forEach(([x, z]) => {
    const band = mesh(new THREE.BoxGeometry(0.12, T - 0.12, 0.02), std({ color: 0x4d4b47, roughness: 0.7 }), { cast: false });
    band.position.set(x, T / 2, z + (z > 0 ? 0.005 : -0.005));
    body.add(band);
  });
  // traseira e fundo interno
  const back = mesh(slab(W - 0.4, L - 0.4, 0.14, R - 0.2), M.black);
  back.position.y = 0.01;
  body.add(back);
  const floor = mesh(face(W - 0.44, L - 0.44, R - 0.22), std({ map: floorTexture(), roughness: 0.6, metalness: 0.25 }), { cast: false });
  floor.position.y = 0.152;
  body.add(floor);

  const y0 = 0.16; // nível onde as peças internas assentam

  /* --- câmeras, alto-falante, motor háptico ---------------------- */
  [[-2.35, -6.05], [-0.8, -6.05], [-1.58, -4.5]].forEach(([x, z], i) => {
    const can = mesh(slab(1.42, 1.42, 0.46, 0.2, 0.03), M.steel);
    can.position.set(x, y0, z);
    body.add(can);
    const ring = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.02, 40), M.steelDark, { cast: false });
    ring.position.set(x, y0 + 0.47, z);
    body.add(ring);
    const fl = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.9), M.flex, { cast: false });
    fl.position.set(x + 0.9, y0 + 0.2, z + (i === 2 ? 0 : 0.3));
    fl.rotation.y = i === 2 ? PI / 2 : 0.4;
    body.add(fl);
  });
  const selfie = mesh(slab(0.9, 0.7, 0.36, 0.1, 0.02), M.steelDark);
  selfie.position.set(0.55, y0, -6.55);
  body.add(selfie);
  const selfieLens = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 32), M.lens, { cast: false });
  selfieLens.position.set(0.55, y0 + 0.37, -6.55);
  body.add(selfieLens);

  const taptic = mesh(slab(3.0, 1.15, 0.42, 0.12, 0.03), M.steel);
  taptic.position.set(-1.5, y0, 5.95);
  body.add(taptic);
  const speaker = mesh(slab(2.5, 1.9, 0.42, 0.2, 0.03), M.rubber);
  speaker.position.set(1.85, y0, 5.75);
  body.add(speaker);
  const mesh2 = mesh(new THREE.BoxGeometry(1.5, 0.02, 0.5), M.steelDark, { cast: false });
  mesh2.position.set(1.85, y0 + 0.43, 5.5);
  body.add(mesh2);
  const port = mesh(slab(0.95, 0.6, 0.34, 0.08, 0.02), M.steel);
  port.position.set(0, y0, 6.85);
  body.add(port);
  const portFlex = mesh(new THREE.BoxGeometry(0.55, 0.02, 2.4), M.kapton, { cast: false });
  portFlex.position.set(0.32, y0 + 0.44, 5.5);
  body.add(portFlex);

  // parafusos internos
  const screwGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14);
  const slotGeo = new THREE.BoxGeometry(0.1, 0.012, 0.022);
  const screw = (x, y, z, parent = body) => {
    const s = mesh(screwGeo, M.steel, { cast: false });
    s.position.set(x, y, z);
    const a = mesh(slotGeo, M.black, { cast: false, receive: false });
    a.position.y = 0.026;
    a.rotation.y = x * 7 + z * 3;
    const b = a.clone();
    b.rotation.y += PI / 2;
    s.add(a, b);
    parent.add(s);
    return s;
  };
  [[-3.1, -6.9], [3.1, -6.9], [-3.1, 6.9], [3.1, 6.9], [-3.15, 0], [3.15, 2.2], [-0.1, 5.2], [-2.9, 5.2], [0.7, 4.75], [3.0, 4.75], [-3.0, -3.6], [0.2, -5.4]].forEach(
    ([x, z]) => screw(x, y0 + 0.44, z)
  );

  /* --- bateria --------------------------------------------------- */
  const battery = new THREE.Group();
  battery.position.set(-0.78, y0, 0.55);
  const bw = 3.95, bl = 8.5;
  battery.add(mesh(slab(bw, bl, 0.4, 0.28, 0.06), M.black));
  const label = mesh(face(bw - 0.14, bl - 0.14, 0.24), std({ map: batteryTexture(), roughness: 0.42, metalness: 0.1 }), { cast: false });
  label.position.y = 0.402;
  battery.add(label);
  const bflex = mesh(new THREE.BoxGeometry(1.0, 0.02, 0.6), M.flex, { cast: false });
  bflex.position.set(bw / 2 + 0.3, 0.3, -3.2);
  battery.add(bflex);
  body.add(battery);
  parts.battery = battery;

  /* --- placa lógica ---------------------------------------------- */
  const board = new THREE.Group();
  const bdW = 1.75, bdL = 11.0;
  board.position.set(2.32, y0, -1.2);
  const pcbMat = std({ color: 0x0a1614, roughness: 0.5 });
  const pcbTop = std({ map: boardTexture(bdW, bdL), roughness: 0.45, metalness: 0.15 });
  const pcb = mesh(new THREE.BoxGeometry(bdW, 0.1, bdL), [pcbMat, pcbMat, pcbTop, pcbMat, pcbMat, pcbMat]);
  pcb.position.y = 0.05;
  board.add(pcb);
  // CIs em relevo + blindagens que saem na microssoldagem
  const chipMat = std({ color: 0x1b1c1f, roughness: 0.35, metalness: 0.1 });
  const shieldMat = std({ color: 0xc2c6ca, metalness: 1, roughness: 0.28 });
  const layout = [
    [0.12, 0.05, 0.7, 0.085],
    [0.1, 0.165, 0.5, 0.05],
    [0.14, 0.26, 0.62, 0.075],
    [0.1, 0.44, 0.55, 0.06],
    [0.2, 0.56, 0.5, 0.04],
    [0.15, 0.86, 0.6, 0.05],
  ];
  const shields = [];
  layout.forEach(([x, y, w, h], i) => {
    const cx = (x + w / 2 - 0.5) * bdW, cz = (y + h / 2 - 0.5) * bdL;
    const ic = mesh(new THREE.BoxGeometry(w * bdW * 0.92, 0.07, h * bdL * 0.92), chipMat, { cast: false });
    ic.position.set(cx, 0.135, cz);
    board.add(ic);
    const sh = mesh(slab(w * bdW + 0.16, h * bdL + 0.16, 0.2, 0.05, 0.015), shieldMat);
    sh.position.set(cx, 0.1, cz);
    sh.userData.home = sh.position.clone();
    sh.userData.i = i;
    board.add(sh);
    shields.push(sh);
  });
  // travas de conector com seus parafusos
  [[-0.1, -2.35, 1.2, 0.55], [0.1, 0.55, 1.1, 0.5], [-0.15, 2.9, 1.0, 0.5]].forEach(([x, z, w, l]) => {
    const cover = mesh(slab(w, l, 0.06, 0.06), M.steelDark);
    cover.position.set(x, 0.3, z);
    board.add(cover);
    screw(x - w / 2 + 0.12, 0.39, z, board);
    screw(x + w / 2 - 0.12, 0.39, z, board);
  });
  body.add(board);
  parts.board = board;
  parts.shields = shields;

  /* --- os dois parafusos pentalobe da base ----------------------- */
  const penta = [];
  [-0.95, 0.95].forEach((x) => {
    const g = new THREE.Group();
    const head = mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.06, 16), M.titanium);
    const shaft = mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.3, 10), M.steel);
    shaft.position.y = -0.17;
    g.add(head, shaft);
    g.position.set(x, T / 2, L / 2 - 0.02);
    g.rotation.x = PI / 2; // deitado, cabeça para fora
    phone.add(g);
    penta.push(g);
  });
  parts.penta = penta;

  /* --- telas: a trincada e a nova -------------------------------- */
  const dW = W - 0.36, dL = L - 0.36, dR = R - 0.18, dT = 0.16;
  const makeDisplay = (cracked) => {
    const g = new THREE.Group();
    const surf = glassSurface({ cracked });
    const screen = new ScreenCanvas({ broken: cracked, crack: surf });
    g.add(mesh(slab(dW, dL, dT, dR, 0.02), M.black));
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: surf.map,
      roughness: 1,
      roughnessMap: surf.rough,
      metalness: 0,
      bumpMap: surf.bump,
      bumpScale: cracked ? -2.2 : 0,
      emissive: 0xffffff,
      emissiveMap: screen.texture,
      emissiveIntensity: 1,
      specularIntensity: 1,
      ior: 1.52,
    });
    const top = mesh(face(dW - 0.04, dL - 0.04, dR - 0.02), glassMat, { cast: false });
    top.position.y = dT + 0.002;
    g.add(top);
    const backMat = std({ map: displayBackTexture(), metalness: 0.7, roughness: 0.4 });
    const bottom = mesh(face(dW - 0.1, dL - 0.1, dR - 0.05, false), backMat, { cast: false });
    bottom.position.y = -0.002;
    g.add(bottom);
    g.position.y = T - dT - 0.015;
    g.userData = { screen, glassMat };
    return g;
  };
  parts.display = makeDisplay(true);
  parts.newDisplay = makeDisplay(false);
  phone.add(parts.display, parts.newDisplay);

  return { phone, parts, materials: M };
}
