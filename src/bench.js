// A bancada: manta, ferramentas, luminária e o "estúdio" que aparece nos reflexos.
import * as THREE from 'three';
import { matTextures, benchTexture, tapeTexture, canvas, rng } from './textures.js';
import { slab, face } from './phone.js';

const PI = Math.PI;
export const MAT = { w: 70, h: 50 };

const std = (o) => new THREE.MeshStandardMaterial(o);
function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// Softboxes desenhados em uma cena à parte e convertidos em mapa de ambiente:
// é isso que o vidro e o titânio refletem.
export function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.BackSide })));
  const panel = (w, h, pos, look, color, power) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(34, 22, [-26, 34, -18], [0, 0, 0], 0xdfeaff, 9); // softbox principal, frio
  panel(8, 46, [44, 16, 6], [0, 0, 0], 0xfff0dc, 5); // tira lateral
  panel(60, 5, [0, 12, 52], [0, 0, 0], 0xbfd4ff, 2.2); // recorte de frente
  panel(14, 14, [20, 40, -30], [0, 0, 0], 0xffc890, 6); // luminária quente
  panel(50, 30, [0, -30, 0], [0, 0, 0], 0x33475a, 0.6); // rebatimento da manta
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}

function knurl() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  for (let i = -64; i < 128; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.moveTo(i + 64, 0);
    g.lineTo(i, 64);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(18, 10);
  return t;
}

export function buildBench(scene, { textureSize }) {
  const props = {};

  /* --- tampo e manta -------------------------------------------- */
  const top = mesh(new THREE.PlaneGeometry(400, 400), std({ map: benchTexture(), roughness: 0.55, metalness: 0 }), false);
  top.rotation.x = -PI / 2;
  top.position.y = -0.3;
  scene.add(top);

  const mt = matTextures(MAT.w, MAT.h, textureSize);
  const matBody = mesh(slab(MAT.w, MAT.h, 0.3, 1.6, 0.08), std({ color: 0x35495a, roughness: 0.9 }));
  matBody.position.y = -0.3;
  scene.add(matBody);
  const matTop = mesh(
    face(MAT.w - 0.16, MAT.h - 0.16, 1.5),
    std({ map: mt.map, roughness: 0.78, bumpMap: mt.bump, bumpScale: 0.6, metalness: 0 }),
    false
  );
  matTop.position.y = 0.001;
  scene.add(matTop);

  /* --- chave de precisão ---------------------------------------- */
  const driver = new THREE.Group();
  const amber = std({ color: 0xd98a1f, metalness: 1, roughness: 0.38, bumpMap: knurl(), bumpScale: 0.6 });
  const steel = std({ color: 0xc4c8cc, metalness: 1, roughness: 0.22 });
  const dark = std({ color: 0x1a1c1f, metalness: 0.9, roughness: 0.4 });
  const handle = mesh(new THREE.CylinderGeometry(0.44, 0.44, 6.2, 48), amber);
  const cap = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.7, 48), dark);
  cap.position.y = 3.5;
  const ring = mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 48), steel);
  ring.position.y = 3.1;
  const neck = mesh(new THREE.CylinderGeometry(0.16, 0.44, 1.1, 48), amber.clone());
  neck.material.bumpMap = null;
  neck.position.y = -3.65;
  const shaft = mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 20), steel);
  shaft.position.y = -6.4;
  const tip = mesh(new THREE.CylinderGeometry(0.03, 0.1, 0.55, 20), dark);
  tip.position.y = -8.95;
  driver.add(handle, cap, ring, neck, shaft, tip);
  driver.rotation.set(0, 0, PI / 2);
  const driverWrap = new THREE.Group();
  driverWrap.add(driver);
  driverWrap.position.set(19.5, 0.47, 6.5);
  driverWrap.rotation.y = 1.25;
  scene.add(driverWrap);

  /* --- pinça ----------------------------------------------------- */
  const armShape = new THREE.Shape();
  armShape.moveTo(0, -0.3);
  armShape.lineTo(3.2, -0.46);
  armShape.lineTo(11.4, -0.03);
  armShape.lineTo(11.4, 0.03);
  armShape.lineTo(3.2, 0.46);
  armShape.lineTo(0, 0.3);
  const armGeo = new THREE.ExtrudeGeometry(armShape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  armGeo.rotateX(-PI / 2);
  const esd = std({ color: 0x111214, roughness: 0.55, metalness: 0.4 });
  const tweezers = new THREE.Group();
  const a1 = mesh(armGeo, esd);
  const a2 = mesh(armGeo, esd);
  a2.position.y = 0.09;
  a2.rotation.z = 0.045;
  tweezers.add(a1, a2);
  tweezers.position.set(16.6, 0.01, -9.5);
  tweezers.rotation.y = 0.5;
  scene.add(tweezers);

  /* --- palhetas de abertura ------------------------------------- */
  const pick = new THREE.Shape();
  const pr = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + PI / 2;
    const x = Math.cos(a) * pr, y = Math.sin(a) * pr;
    if (i === 0) pick.moveTo(x + Math.cos(a - 2.1) * 0.5, y + Math.sin(a - 2.1) * 0.5);
    pick.absarc(Math.cos(a) * (pr - 0.5), Math.sin(a) * (pr - 0.5), 0.5, a - PI / 3, a + PI / 3, false);
  }
  const pickGeo = new THREE.ExtrudeGeometry(pick, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 12 });
  pickGeo.rotateX(-PI / 2);
  const pickMat = new THREE.MeshPhysicalMaterial({ color: 0x2c6fd0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 });
  [[9.5, -12.8, 0.3], [11.2, -11.6, 1.5], [10.0, -11.0, 2.6]].forEach(([x, z, r], i) => {
    const p = mesh(pickGeo, pickMat);
    p.position.set(x, 0.02 + i * 0.09, z);
    p.rotation.y = r;
    scene.add(p);
  });

  /* --- rolo de fita kapton -------------------------------------- */
  const ringGeo = (r0, r1, h) =>
    new THREE.LatheGeometry([new THREE.Vector2(r0, 0), new THREE.Vector2(r1, 0), new THREE.Vector2(r1, h), new THREE.Vector2(r0, h), new THREE.Vector2(r0, 0)], 72);
  const kapton = new THREE.MeshPhysicalMaterial({ color: 0xc27a14, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.15 });
  const roll = new THREE.Group();
  roll.add(mesh(ringGeo(1.75, 2.35, 1.2), kapton));
  roll.add(mesh(ringGeo(1.6, 1.76, 1.24), std({ color: 0xb8a583, roughness: 0.9 })));
  roll.position.set(-9.5, 0, -13);
  scene.add(roll);

  /* --- espátula de nylon ---------------------------------------- */
  const spudger = mesh(slab(15, 0.85, 0.3, 0.3, 0.06), std({ color: 0x0c0c0e, roughness: 0.5 }));
  spudger.position.set(1.5, 0, -12.2);
  spudger.rotation.y = 0.06;
  scene.add(spudger);

  /* --- fitas crepe com anotações -------------------------------- */
  const tape = (text, x, z, rot, w = 6) => {
    const m = mesh(
      new THREE.PlaneGeometry(w, w / 4),
      std({ map: tapeTexture(text), roughness: 0.85, alphaTest: 0.5, transparent: false }),
      false
    );
    m.rotation.x = -PI / 2;
    m.rotation.z = rot;
    m.position.set(x, 0.012, z);
    scene.add(m);
    return m;
  };
  tape('OS 2741 — tela + bateria', 21.5, 13.5, 0.05, 9);
  tape('pentalobe ×2', 9.4, 15.6, -0.04, 5);
  tape('não soprar a placa!', 17.5, -15, -0.12, 7);

  /* --- parafusos soltos na bandeja ------------------------------ */
  const r = rng(5);
  const sg = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
  const sh = new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8);
  for (let i = 0; i < 16; i++) {
    const cell = 1 + Math.floor(r() * 4);
    const s = new THREE.Group();
    const head = mesh(sg, steel);
    const shaftS = mesh(sh, steel);
    shaftS.position.y = -0.12;
    s.add(head, shaftS);
    s.position.set(5.5 + (cell % 3) * 3.1 + r() * 2.2, 0.07, 9.9 + Math.floor(cell / 3) * 2.3 + r() * 1.3);
    s.rotation.set(PI / 2, 0, r() * 6.28);
    scene.add(s);
  }

  /* --- ferro de solda (entra em cena na microssoldagem) --------- */
  const iron = new THREE.Group();
  const tipI = mesh(new THREE.CylinderGeometry(0.015, 0.11, 1.3, 20), std({ color: 0x9aa0a6, metalness: 1, roughness: 0.25 }));
  tipI.position.y = 0.65;
  const barrel = mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.6, 24), std({ color: 0xaeb3b8, metalness: 1, roughness: 0.3 }));
  barrel.position.y = 3.1;
  const collar = mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.7, 32), amber.clone());
  collar.material.bumpMap = null;
  collar.position.y = 5.2;
  const grip = mesh(new THREE.CylinderGeometry(0.5, 0.46, 9, 32), std({ color: 0x0e0f11, roughness: 0.8 }));
  grip.position.y = 10;
  iron.add(tipI, barrel, collar, grip);
  const glow = new THREE.PointLight(0xff7a2a, 0, 6, 2);
  glow.position.y = 0.1;
  iron.add(glow);
  scene.add(iron);
  props.iron = iron;
  props.ironGlow = glow;

  return props;
}

export function buildLights(scene) {
  // luminária articulada: segue o cursor
  const lamp = new THREE.SpotLight(0xffdcb0, 5.2, 0, 0.56, 1, 0);
  lamp.position.set(-8, 34, 6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 8;
  lamp.shadow.camera.far = 70;
  lamp.shadow.bias = -0.0004;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 5;
  lamp.shadow.blurSamples = 16;
  scene.add(lamp, lamp.target);

  const fill = new THREE.DirectionalLight(0x9fbcff, 0.22);
  fill.position.set(20, 30, 30);
  scene.add(fill);
  return { lamp, fill };
}
