import '@fontsource-variable/archivo/standard.css';
import '@fontsource/permanent-marker/400.css';
import './style.css';

import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  DepthOfFieldEffect,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BlendFunction,
} from 'postprocessing';
import { buildPhone, DIM } from './phone.js';
import { buildBench, buildEnvironment, buildLights } from './bench.js';
import { initUI } from './ui.js';

const PI = Math.PI;
const canvasEl = document.getElementById('bench');
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Roteiro: o que cada peça faz em cada capítulo da página             */
/* pose = [x, y, z, rx, ry, rz]                                        */
/* ------------------------------------------------------------------ */
const dispY = DIM.T - 0.16 - 0.015;
const HOME = {
  display: [0, dispY, 0, 0, 0, 0],
  battery: [-0.78, 0.16, 0.55, 0, 0, 0],
  board: [2.32, 0.16, -1.2, 0, 0, 0],
};
const parked = [11.6, 0.0, 1.6, 0, -0.12, 0]; // tela antiga fica de lado, fora da área do texto
const SCRIPT = {
  //           0 chegou        1 tela                      2 bateria   3 placa   4 peças               5 pronto
  display: [HOME.display, [-4.9, 4.9, -0.6, 0, 0.1, -0.95], parked, parked, [-8.0, 0, 0, 0, 0, 0], parked],
  newDisplay: [
    [0, 46, 0, 0, 0, 0.3],
    [0, 46, 0, 0, 0, 0.3],
    [0, 46, 0, 0, 0, 0.3],
    [0, 46, 0, 0, 0, 0.3],
    [0, 46, 0, 0, 0, 0.3],
    HOME.display,
  ],
  battery: [HOME.battery, HOME.battery, [-0.4, 3.5, 0.55, -0.1, 0, 0.13], HOME.battery, [6.25, 0, 0, 0, 0, 0], HOME.battery],
  board: [HOME.board, HOME.board, HOME.board, HOME.board, [9.7, 0, 0, 0, 0, 0], HOME.board],
  shields: [0, 0, 0, 1, 0, 0],
  penta: [0, 1, 1, 1, 1, 0],
  iron: [0, 0, 0, 1, 0, 0],
  boot: [0, 0, 0, 0, 0, 1],
  cam: [
    { p: [8, 30, 25], t: [0, 0.4, 0.3], blur: 2.2 },
    { p: [13, 17, 25], t: [-1.6, 2.2, 0], blur: 3.0 },
    { p: [13, 27, 25], t: [2.6, 1.2, 0.6], blur: 2.4 },
    { p: [8.2, 7.4, 5.2], t: [2.25, 0.45, -1.7], blur: 5.5 },
    { p: [-0.4, 74, 9], t: [-0.4, 0, 0.4], blur: 0.5 },
    { p: [2.5, 40, 18], t: [2.2, 0.4, 0.4], blur: 1.8 },
  ],
};
const LAST = SCRIPT.cam.length - 1;

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

function split(f) {
  const i = Math.min(LAST - 1, Math.max(0, Math.floor(f)));
  const t = ease(clamp01((f - i - 0.14) / 0.72));
  return [i, t];
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ea = new THREE.Euler();
function applyPose(obj, keys, f) {
  const [i, t] = split(f);
  const a = keys[i], b = keys[i + 1];
  obj.position.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  qa.setFromEuler(ea.set(a[3], a[4], a[5]));
  qb.setFromEuler(ea.set(b[3], b[4], b[5]));
  obj.quaternion.slerpQuaternions(qa, qb, t);
}
function scalar(keys, f) {
  const [i, t] = split(f);
  return lerp(keys[i], keys[i + 1], t);
}

/* ------------------------------------------------------------------ */
async function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
  } catch (e) {
    document.documentElement.classList.add('no-gl');
    initUI();
    return;
  }
  await Promise.all([
    document.fonts.load('800 40px "Archivo Variable"'),
    document.fonts.load('500 20px "Archivo Variable"'),
    document.fonts.load('40px "Permanent Marker"'),
  ]).catch(() => {});

  const small = Math.min(innerWidth, innerHeight) < 700;
  const dpr = Math.min(devicePixelRatio || 1, small ? 2 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // o tone mapping é feito no pós-processamento
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e11);
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(24, 1, 1, 300);
  const { lamp } = buildLights(scene);
  const props = buildBench(scene, { textureSize: small ? 2048 : 4096 });
  const { phone, parts } = buildPhone();
  scene.add(phone);

  // ferro de solda: estacionado na manta ou encostado na placa
  const up = new THREE.Vector3(0, 1, 0);
  const ironRest = { p: new THREE.Vector3(24, 0.5, -3), q: new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0.25, 0.02, 1).normalize()) };
  const ironWork = { p: new THREE.Vector3(2.02, 0.42, -1.75), q: new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0.5, 0.62, -0.6).normalize()) };

  /* --- pós-processamento ---------------------------------------- */
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  const dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 40, worldFocusRange: 14, bokehScale: 2.2, resolutionScale: 0.5 });
  const dofPass = new EffectPass(camera, dof);
  composer.addPass(dofPass);
  const bloom = new BloomEffect({ intensity: 0.35, luminanceThreshold: 0.92, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.62 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.16;
  composer.addPass(new EffectPass(camera, bloom, tone, vignette, noise, new SMAAEffect()));

  /* --- tamanho e enquadramento ---------------------------------- */
  let W = 1, H = 1, wide = true;
  function resize() {
    W = innerWidth;
    H = innerHeight;
    wide = W / H >= 1.15;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
    // o aparelho fica à direita no desktop e no alto no celular; o texto ocupa o resto
    if (wide) camera.setViewOffset(W, H, -W * 0.19, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.17, W, H);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  /* --- entrada: rolagem e cursor --------------------------------- */
  const sections = [...document.querySelectorAll('section[data-chapter]')];
  let chapterTarget = 0, chapter = params.has('ch') ? parseFloat(params.get('ch')) : 0;
  function readScroll() {
    if (params.has('ch')) return (chapterTarget = parseFloat(params.get('ch')));
    const mid = scrollY + innerHeight / 2;
    const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
    centers[0] = Math.min(centers[0], innerHeight / 2);
    let f = 0;
    for (let i = 0; i < centers.length - 1; i++) {
      if (mid >= centers[i]) f = i + clamp01((mid - centers[i]) / (centers[i + 1] - centers[i]));
    }
    chapterTarget = f;
  }
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();
  if (!params.has('ch')) chapter = chapterTarget;

  const mouse = new THREE.Vector2(-0.25, -0.1), mouseT = mouse.clone();
  addEventListener('pointermove', (e) => mouseT.set((e.clientX / W) * 2 - 1, (e.clientY / H) * 2 - 1), { passive: true });

  const ui = initUI();
  if (params.has('debug')) window.__dbg = { parts, camera, scene, get chapter() { return chapter; }, get target() { return chapterTarget; } };

  /* --- laço ------------------------------------------------------ */
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), v = new THREE.Vector3();
  const clock = new THREE.Timer();
  let lampOn = 0, slowFrames = 0, frames = 0, lowered = false;
  const still = params.has('still'); // para capturas: sem animação de entrada

  function frame() {
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsed();

    chapter += (chapterTarget - chapter) * (reduced || still ? 1 : 1 - Math.exp(-dt * 5.5));
    const f = chapter;
    ui.setChapter(f);

    // peças
    applyPose(parts.display, SCRIPT.display, f);
    applyPose(parts.newDisplay, SCRIPT.newDisplay, f);
    parts.newDisplay.visible = parts.newDisplay.position.y < 40;
    applyPose(parts.battery, SCRIPT.battery, f);
    applyPose(parts.board, SCRIPT.board, f);

    const sh = scalar(SCRIPT.shields, f);
    parts.shields.forEach((s) => {
      const k = clamp01(sh * 1.6 - s.userData.i * 0.1);
      s.position.copy(s.userData.home);
      s.position.y += k * (0.9 + s.userData.i * 0.22);
      s.position.x += k * (0.25 + (s.userData.i % 2) * 0.5);
      s.rotation.z = -k * 0.22;
    });

    const pe = scalar(SCRIPT.penta, f);
    parts.penta.forEach((s, i) => {
      const hx = i ? 0.95 : -0.95;
      const out = clamp01(pe * 2.2), fly = clamp01(pe * 2.2 - 1.2);
      s.position.set(lerp(hx, 6.3 + i * 0.9, fly), lerp(DIM.T / 2, 0.075, fly) + Math.sin(fly * PI) * 2.2, lerp(DIM.L / 2 - 0.02 + out * 0.5, 10.5 + i * 0.4, fly));
      s.rotation.set(PI / 2, 0, out * 14 + fly * (1 + i));
    });

    const ir = scalar(SCRIPT.iron, f);
    props.iron.position.lerpVectors(ironRest.p, ironWork.p, ir);
    props.iron.position.y += Math.sin(ir * PI) * 7;
    props.iron.quaternion.slerpQuaternions(ironRest.q, ironWork.q, ir);
    props.ironGlow.intensity = ir > 0.9 ? (8 + Math.sin(t * 30) * 2) * (ir - 0.9) * 10 : 0;

    // telas
    parts.display.userData.screen.draw(false, t);
    parts.newDisplay.userData.screen.draw(false, t);
    const boot = clamp01(scalar(SCRIPT.boot, f) * 4 - 3);
    parts.newDisplay.userData.glassMat.emissiveIntensity = boot * 1.05;
    parts.display.userData.glassMat.emissiveIntensity = 1.0 + (Math.sin(t * 23) > 0.96 ? -0.35 : 0);

    // luminária
    mouse.lerp(mouseT, 1 - Math.exp(-dt * 3));
    lampOn = still ? 1 : Math.min(1, lampOn + dt / 1.8);
    const flicker = lampOn < 0.5 ? (Math.sin(t * 60) > 0.2 ? lampOn * 1.6 : 0.05) : lampOn;
    lamp.intensity = 5.2 * flicker;
    scene.environmentIntensity = 0.12 + 0.26 * lampOn;
    lamp.position.set(-12 + mouse.x * 16, 30, -6 + mouse.y * 12);
    lamp.target.position.set(mouse.x * 2, 0, mouse.y * 2);

    // câmera
    const [i, k] = split(f);
    const a = SCRIPT.cam[i], b = SCRIPT.cam[i + 1];
    camPos.set(lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k));
    camTgt.set(lerp(a.t[0], b.t[0], k), lerp(a.t[1], b.t[1], k), lerp(a.t[2], b.t[2], k));
    const aspect = W / H;
    const fit = wide ? Math.max(1, 1.62 / aspect) : 1 + (1.15 - aspect) * 1.05;
    v.subVectors(camPos, camTgt).multiplyScalar(fit);
    camera.position.copy(camTgt).add(v);
    if (!reduced) {
      camera.position.x += mouse.x * 0.6;
      camera.position.y -= mouse.y * 0.4;
      camera.position.x += Math.sin(t * 0.31) * 0.06; // respiração de câmera na mão
      camera.position.y += Math.sin(t * 0.23) * 0.05;
    }
    camera.lookAt(camTgt);
    const dist = camera.position.distanceTo(camTgt);
    dof.cocMaterial.worldFocusDistance = dist;
    dof.cocMaterial.worldFocusRange = dist * 0.42;
    dof.bokehScale = lerp(a.blur, b.blur, k);

    composer.render(dt);
    if (!lowered && !still && ++frames > 40) {
      slowFrames = dt > 0.034 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 45) {
        lowered = true;
        renderer.setPixelRatio(1);
        dofPass.enabled = false;
        lamp.shadow.mapSize.set(1024, 1024);
        lamp.shadow.map?.dispose();
        lamp.shadow.map = null;
        resize();
      }
    }
    if (!document.documentElement.classList.contains('ready')) document.documentElement.classList.add('ready');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

start();
