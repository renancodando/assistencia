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
import { buildPhone } from './phone.js';
import { createChoreo } from './choreo.js';
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
// Trilha da câmera: ela acompanha a ação (parafusos, conectores, solda) em close
// e abre de novo no repouso de cada capítulo (f inteiro).
const CAM = [
  { f: 0.0, p: [8, 30, 25], t: [0, 0.4, 0.3], blur: 2.2 },
  { f: 0.3, p: [11, 7.5, 17.5], t: [0.6, 0.7, 9.2], blur: 4.2 }, // chave nos pentalobe
  { f: 0.56, p: [-10, 13, 19], t: [-1.2, 0.8, 1.5], blur: 3.0 }, // palheta na lateral
  { f: 1.0, p: [-15, 15, 22], t: [1.4, 2.6, -0.4], blur: 2.6 }, // tela aberta
  { f: 1.24, p: [-7.5, 9.5, 9.5], t: [2.5, 0.9, 0.1], blur: 4.4 }, // tampa dos conectores
  { f: 1.48, p: [-6.2, 6.2, 7.4], t: [2.9, 1.0, -0.1], blur: 5.0 }, // cabos desencaixando
  { f: 1.74, p: [10, 25, 24], t: [2.6, 1.6, 0.5], blur: 2.4 },
  { f: 2.0, p: [13, 27, 25], t: [2.6, 1.2, 0.6], blur: 2.4 }, // bateria
  { f: 2.62, p: [8.8, 8.6, 6.2], t: [2.3, 0.6, -1.5], blur: 5.0 }, // blindagens
  { f: 3.0, p: [8.2, 7.4, 5.2], t: [2.25, 0.45, -1.7], blur: 5.5 }, // microssoldagem
  { f: 3.38, p: [10, 14, 13], t: [2.7, 0.5, -0.6], blur: 3.6 }, // parafusos da placa
  { f: 4.0, p: [-1.9, 74, 9], t: [-1.9, 0, 0.4], blur: 0.5 }, // peças na manta
  { f: 4.34, p: [7, 30, 23], t: [1.6, 0.5, 0], blur: 2.2 },
  { f: 4.63, p: [-6.5, 7.5, 8.5], t: [2.9, 1.0, -0.1], blur: 4.6 }, // cabos da tela nova
  { f: 4.86, p: [-6, 22, 24], t: [1.2, 1.2, 0.6], blur: 2.4 }, // fechando
  { f: 5.0, p: [2.5, 40, 18], t: [2.2, 0.4, 0.4], blur: 1.8 }, // pronto
];
const LAST_CHAPTER = 5;

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

function camSegment(f) {
  let i = 0;
  while (i < CAM.length - 2 && f >= CAM[i + 1].f) i++;
  const a = CAM[i], b = CAM[i + 1];
  return [a, b, ease(clamp01((f - a.f) / (b.f - a.f)))];
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
  const { phone, parts, anchors } = buildPhone();
  scene.add(phone);
  const choreo = createChoreo({ parts, props, anchors });

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

    // peças, ferramentas e cabos
    choreo.update(f, t);
    parts.display.userData.screen.draw(false, t);
    parts.newDisplay.userData.screen.draw(false, t);

    // luminária
    mouse.lerp(mouseT, 1 - Math.exp(-dt * 3));
    lampOn = still ? 1 : Math.min(1, lampOn + dt / 1.8);
    const flicker = lampOn < 0.5 ? (Math.sin(t * 60) > 0.2 ? lampOn * 1.6 : 0.05) : lampOn;
    lamp.intensity = 5.2 * flicker;
    scene.environmentIntensity = 0.12 + 0.26 * lampOn;
    lamp.position.set(-12 + mouse.x * 16, 30, -6 + mouse.y * 12);
    lamp.target.position.set(mouse.x * 2, 0, mouse.y * 2);

    // câmera
    const [a, b, k] = camSegment(f);
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
