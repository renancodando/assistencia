// Coreografia do conserto.
//
// Tudo é função pura de f (o capítulo fracionário que vem da rolagem), então a
// animação anda para frente e para trás sem estado: remontar é desmontar ao contrário.
//
// Linha do tempo (f):
//   0→1  chave tira os 2 pentalobe · palheta corta o adesivo · tela abre em dobradiça
//   1→2  chave tira a tampa dos conectores · cabos desencaixam · tela sai · bateria descola
//   2→3  bateria volta · blindagens são alavancadas · ferro de solda encosta
//   3→4  chave solta a placa · peças vão para a manta em arco
//   4→5  tudo volta na ordem inversa, com a tela nova
import * as THREE from 'three';
import { DIM } from './phone.js';

const PI = Math.PI;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const win = (f, a, b) => clamp01((f - a) / (b - a));
const ss = (t) => t * t * (3 - 2 * t); // suave
const io = (t) => t * t * t * (t * (t * 6 - 15) + 10); // mais suave nas pontas
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const Y = V(0, 1, 0), Z = V(0, 0, 1);
const OPEN = (100 * PI) / 180; // ângulo em que a tela encosta na caixa
const dispY = DIM.T - 0.16 - 0.015;
const HINGE_X = 3.4; // borda direita da tela

export function createChoreo({ parts, props, anchors }) {
  const { display, newDisplay, battery, batteryFlex, board, shields, coverPlate } = parts;
  const { driver, driverSpin, pick, iron, ironGlow } = props;

  /* ---------------------------------------------------------------
     Chave + parafusos. Uma "cadeia" é uma sequência de parafusos que a
     chave tira (e, na volta, coloca). c percorre [0, N + 0.6].
     --------------------------------------------------------------- */
  const REST = { tip: V(17.2, 0.05, 10.5), axis: V(0.3, 0.065, -0.95).normalize() };
  const CARRY_AXIS = V(0.1, 1, 0.35).normalize();
  const A = 0.26, S = 0.62, C = 0.86; // fim de: aproximação, giro, transporte

  const makeChain = ({ screws, axis, driverAxis, travel, turns, tray, rem, ins }) => {
    const qSeat = new THREE.Quaternion().setFromUnitVectors(Y, axis);
    return {
      screws,
      axis,
      driverAxis: driverAxis.normalize(),
      qSeat,
      travel,
      turns,
      rem,
      ins,
      tasks: screws.map((sc, i) => {
        const lieDir = V(Math.cos(0.7 + i * 1.9), 0, Math.sin(0.7 + i * 1.9));
        return {
          sc,
          seat: sc.userData.seat.clone(),
          drop: V(tray[i][0], sc.children[1].geometry.parameters.height + 0.1, tray[i][1]),
          lie: V(tray[i][0], sc.userData.r, tray[i][1]),
          qLie: new THREE.Quaternion().setFromUnitVectors(Y, lieDir),
        };
      }),
    };
  };

  const chains = [
    makeChain({
      screws: parts.penta,
      axis: Z.clone(),
      driverAxis: V(0, 0.12, 1),
      travel: 0.36,
      turns: 5,
      tray: [[6.2, 10.4], [7.2, 10.9]],
      rem: [0.1, 0.46],
      ins: [4.885, 4.965],
    }),
    makeChain({
      screws: parts.coverScrews,
      axis: Y.clone(),
      driverAxis: V(-0.16, 1, 0.22),
      travel: 0.24,
      turns: 4,
      tray: [[8.9, 12.4], [9.5, 12.95]],
      rem: [1.1, 1.33],
      ins: [4.7, 4.8],
    }),
    makeChain({
      screws: parts.boardScrews,
      axis: Y.clone(),
      driverAxis: V(-0.1, 1, 0.24),
      travel: 0.24,
      turns: 4,
      tray: [[12.0, 10.3], [12.75, 10.85], [13.4, 10.25]],
      rem: [3.24, 3.5],
      ins: [4.24, 4.4],
    }),
  ];

  const tip = V(), axis = V(), tmp = V(), tmp2 = V();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qSpin = new THREE.Quaternion();
  const hop = (p, h) => Math.sin(p * PI) * h;

  // pose da chave no fim da tarefa i (pairando sobre a bandeja)
  const endTip = (task, out) => out.copy(task.drop).addScaledVector(Y, 1.2);

  function runChain(ch, f) {
    const N = ch.tasks.length;
    const c = (N + 0.6) * (win(f, ch.rem[0], ch.rem[1]) - win(f, ch.ins[0], ch.ins[1]));

    // parafusos
    ch.tasks.forEach((task, i) => {
      const s = clamp01(c - i);
      const sc = task.sc;
      if (s <= A) {
        sc.position.copy(task.seat);
        sc.quaternion.copy(ch.qSeat);
      } else if (s <= S) {
        // gira e sobe pelo passo da rosca: translação presa ao ângulo
        const p = ss((s - A) / (S - A));
        sc.position.copy(task.seat).addScaledVector(ch.axis, ch.travel * p);
        qSpin.setFromAxisAngle(Y, ch.turns * 2 * PI * p);
        sc.quaternion.copy(ch.qSeat).multiply(qSpin);
      } else if (s <= C) {
        // preso na ponta imantada
        const p = io((s - S) / (C - S));
        tmp.copy(task.seat).addScaledVector(ch.axis, ch.travel);
        sc.position.lerpVectors(tmp, task.drop, p);
        sc.position.y += hop(p, 2.4);
        axis.copy(ch.driverAxis).lerp(CARRY_AXIS, p).normalize();
        q1.setFromUnitVectors(Y, axis);
        sc.quaternion.copy(ch.qSeat).slerp(q1, Math.min(1, p * 5));
      } else if (s < 1) {
        // solta: tomba na bandeja e quica uma vez
        const p = (s - C) / (1 - C), e = ss(clamp01(p * 1.6));
        sc.position.lerpVectors(task.drop, task.lie, e);
        sc.position.y += Math.abs(Math.sin(p * PI * 2)) * 0.1 * (1 - p);
        q1.setFromUnitVectors(Y, CARRY_AXIS);
        sc.quaternion.copy(q1).slerp(task.qLie, e);
      } else {
        sc.position.copy(task.lie);
        sc.quaternion.copy(task.qLie);
      }
    });

    // chave
    if (c <= 0 || c >= N + 0.6) return false;
    let spin = 0;
    if (c >= N) {
      const p = io((c - N) / 0.6);
      endTip(ch.tasks[N - 1], tmp);
      tip.lerpVectors(tmp, REST.tip, p);
      tip.y += hop(p, 2.5);
      axis.copy(CARRY_AXIS).lerp(REST.axis, p).normalize();
    } else {
      const i = Math.floor(c), s = c - i, task = ch.tasks[i];
      spin = i * 1.3;
      if (s <= A) {
        const e = s / A, e1 = io(win(e, 0, 0.72)), e2 = ss(win(e, 0.72, 1));
        if (i === 0) {
          tmp.copy(REST.tip);
          tmp2.copy(REST.axis);
        } else {
          endTip(ch.tasks[i - 1], tmp);
          tmp2.copy(CARRY_AXIS);
        }
        // primeiro alinha a 1 cm da cabeça, depois desce pelo eixo
        tip.copy(task.seat).addScaledVector(ch.driverAxis, 1.0);
        tip.lerpVectors(tmp, tip, e1);
        tip.y += hop(e1, 2.2);
        tip.addScaledVector(ch.driverAxis, -1.0 * e2 * e1);
        axis.copy(tmp2).lerp(ch.driverAxis, e1).normalize();
      } else if (s <= S) {
        const p = ss((s - A) / (S - A));
        tip.copy(task.seat).addScaledVector(ch.axis, ch.travel * p);
        axis.copy(ch.driverAxis);
        spin += ch.turns * 2 * PI * p;
      } else if (s <= C) {
        const p = io((s - S) / (C - S));
        tmp.copy(task.seat).addScaledVector(ch.axis, ch.travel);
        tip.lerpVectors(tmp, task.drop, p);
        tip.y += hop(p, 2.4);
        axis.copy(ch.driverAxis).lerp(CARRY_AXIS, p).normalize();
        spin += ch.turns * 2 * PI;
      } else {
        const p = io((s - C) / (1 - C));
        tip.copy(task.drop).addScaledVector(Y, 1.2 * p);
        axis.copy(CARRY_AXIS);
        spin += ch.turns * 2 * PI;
      }
    }
    driver.position.copy(tip);
    driver.quaternion.setFromUnitVectors(Y, axis);
    driverSpin.rotation.y = spin;
    return true;
  }

  /* ---------------------------------------------------------------
     Tela: dobradiça na borda direita, apoio na caixa, cabos
     --------------------------------------------------------------- */
  const qPark = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.12, 0));
  const PARK = V(11.6, 0, 1.6);
  const KNOLL = V(-8.0, 0, 0);
  const qId = new THREE.Quaternion();

  function setHinge(obj, theta) {
    // a tela primeiro sobe do rebaixo da carcaça e só então gira sobre a borda
    const l = ss(clamp01(theta / 0.21));
    const px = HINGE_X + 0.12 * l, py = dispY + 0.225 * l;
    const c = Math.cos(-theta), s = Math.sin(-theta);
    obj.position.set(px - c * HINGE_X, py - s * HINGE_X, 0);
    obj.quaternion.setFromAxisAngle(Z, -theta);
  }

  const e2 = new THREE.Vector2(), t2 = new THREE.Vector2(), ef = new THREE.Vector2(), tf = new THREE.Vector2();
  const qInv = new THREE.Quaternion();
  const w = V(), g = V(), up = V(), ta = V();

  // attach: 1 = encaixado na placa, 0 = solto. pop: conector levantado do soquete.
  function updateCables(disp, attach, pop) {
    disp.updateMatrixWorld(true);
    qInv.copy(disp.quaternion).invert();
    g.set(0, -1, 0).applyQuaternion(qInv); // gravidade vista pela tela
    up.set(0, 1, 0).applyQuaternion(qInv);
    ta.set(-1, 0, 0).applyQuaternion(qInv); // o cabo entra no conector vindo da dobradiça
    disp.userData.cables.forEach((cable, j) => {
      // ponta solta: o flex é meio rígido, segue a tela e cede um pouco à gravidade
      tf.set(1 + g.x * 0.55, g.y * 0.55).normalize();
      ef.copy(cable.B).addScaledVector(tf, cable.L * 0.96);
      w.set(ef.x, ef.y, cable.z);
      disp.localToWorld(w);
      // não atravessa a manta nem a carcaça
      const inside = 1 - ss(win(Math.abs(w.x), 3.7, 5.2));
      const minY = lerp(0.05, 0.92, inside);
      if (w.y < minY) {
        w.y = minY;
        disp.worldToLocal(w);
        ef.set(w.x, w.y);
        tf.set(ef.x - cable.B.x + 0.6, ef.y - cable.B.y).normalize();
      }
      const a = attach[j];
      if (a > 0) {
        w.copy(anchors.cableA[j]);
        w.y += 0.24 * pop[j];
        disp.worldToLocal(w);
        e2.set(w.x + up.x * 0, w.y);
        t2.set(ta.x, ta.y).normalize();
        ef.lerp(e2, a);
        tf.lerp(t2, a).normalize();
      }
      cable.solve(ef, tf);
    });
  }

  const dPos = V(), dQuat = new THREE.Quaternion();

  /* ---------------------------------------------------------------
     Ferramentas e peças soltas
     --------------------------------------------------------------- */
  const pickRest = { p: V(10.6, 0.3, -12.1), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.9, 0)) };
  const pickWorkQ = new THREE.Quaternion().setFromAxisAngle(Z, -0.2).multiply(new THREE.Quaternion().setFromAxisAngle(Y, -PI / 2));
  const pickTip = V();

  const ironRest = { p: V(24, 0.5, -3), q: new THREE.Quaternion().setFromUnitVectors(Y, V(0.25, 0.02, 1).normalize()) };
  const ironWork = { p: V(2.02, 0.42, -1.75), q: new THREE.Quaternion().setFromUnitVectors(Y, V(0.5, 0.62, -0.6).normalize()) };

  const BAT_HOME = V(-0.78, 0.16, 0.55), BAT_KNOLL = V(6.25, 0, 1.2), BAT_HALF = 4.25;
  const BOARD_HOME = V(2.32, 0.16, -1.2), BOARD_KNOLL = V(9.7, 0, 0);
  const COVER_TRAY = V(10.35, 0.0, 13.1);
  const eul = new THREE.Euler();

  return {
    update(f, t) {
      /* --- chave e parafusos ------------------------------------- */
      let busy = false;
      for (const ch of chains) busy = runChain(ch, f) || busy;
      if (!busy) {
        driver.position.copy(REST.tip);
        driver.quaternion.setFromUnitVectors(Y, REST.axis);
        driverSpin.rotation.y = 0;
      }

      /* --- palheta: entra no canto, corre a lateral, volta -------- */
      const pu = win(f, 0.44, 0.78);
      const slide = ss(win(pu, 0.3, 0.72));
      if (pu <= 0 || pu >= 1) {
        pick.position.copy(pickRest.p);
        pick.quaternion.copy(pickRest.q);
      } else {
        const inA = io(win(pu, 0, 0.3)), out = io(win(pu, 0.72, 1));
        pickTip.set(-3.22, 0.74 + slide * 0.12, lerp(6.1, -5.6, slide));
        tmp.set(pickTip.x - 1.47, pickTip.y + 0.3, pickTip.z); // centro da palheta
        const k = inA * (1 - out);
        pick.position.lerpVectors(pickRest.p, tmp, k);
        pick.position.y += hop(inA, 3) * (out > 0 ? 0 : 1) + hop(out, 3);
        pick.quaternion.copy(pickRest.q).slerp(pickWorkQ, k);
      }

      /* --- tela trincada ------------------------------------------ */
      const pre = slide * 0.05; // a lateral levanta conforme o adesivo é cortado
      const theta = pre + (OPEN - pre) * io(win(f, 0.6, 0.9));
      setHinge(display, theta);
      const away = io(win(f, 1.54, 1.84));
      if (away > 0) {
        dPos.copy(display.position);
        dQuat.copy(display.quaternion);
        display.position.lerpVectors(dPos, PARK, away);
        display.position.y += hop(away, 3.6);
        display.quaternion.copy(dQuat).slerp(qPark, away);
      }
      const knoll = io(win(f, 3.45, 3.8)) - io(win(f, 4.08, 4.3));
      if (knoll > 0) {
        display.position.lerpVectors(PARK, KNOLL, knoll);
        display.position.y += hop(knoll, 6.5);
        display.quaternion.copy(qPark).slerp(qId, knoll);
      }
      updateCables(
        display,
        [1 - io(win(f, 1.42, 1.5)), 1 - io(win(f, 1.46, 1.54))],
        [ss(win(f, 1.4, 1.44)), ss(win(f, 1.44, 1.48))]
      );

      /* --- tela nova: chega aberta, encaixa os cabos, fecha -------- */
      const arrive = io(win(f, 4.4, 4.58));
      newDisplay.visible = f > 4.4;
      setHinge(newDisplay, OPEN * (1 - io(win(f, 4.79, 4.89))));
      if (arrive < 1) {
        newDisplay.position.x += (1 - arrive) * 5;
        newDisplay.position.y += (1 - arrive) * 26;
      }
      updateCables(
        newDisplay,
        [io(win(f, 4.58, 4.64)), io(win(f, 4.61, 4.67))],
        [1 - ss(win(f, 4.62, 4.65)), 1 - ss(win(f, 4.65, 4.68))]
      );
      newDisplay.userData.glassMat.emissiveIntensity = win(f, 4.95, 4.995) * 1.05;
      display.userData.glassMat.emissiveIntensity = 1.0 + (Math.sin(t * 23) > 0.96 ? -0.35 : 0);

      /* --- tampa dos conectores ----------------------------------- */
      const cov = io(win(f, 1.33, 1.42)) - io(win(f, 4.65, 4.71));
      coverPlate.position.lerpVectors(coverPlate.userData.home, COVER_TRAY, cov);
      coverPlate.position.y += hop(cov, 2.6);
      coverPlate.rotation.y = cov * 0.5;

      /* --- bateria: descola por uma ponta, depois sobe ------------ */
      const bu = io(win(f, 1.68, 1.92)) - io(win(f, 2.12, 2.4));
      const bk = io(win(f, 3.42, 3.7)) - io(win(f, 4.1, 4.3));
      const peel = 0.2 * ss(win(bu, 0, 0.5)) - 0.08 * ss(win(bu, 0.5, 1));
      const rise = 2.7 * io(win(bu, 0.3, 1));
      const side = ss(win(bu, 0.4, 1));
      battery.position.set(
        BAT_HOME.x + 0.38 * side,
        BAT_HOME.y + BAT_HALF * Math.sin(peel) + rise,
        BAT_HOME.z - BAT_HALF * (1 - Math.cos(peel))
      );
      battery.quaternion.setFromEuler(eul.set(-peel, 0, 0.13 * side));
      if (bk > 0) {
        battery.position.lerpVectors(BAT_HOME, BAT_KNOLL, bk);
        battery.position.y += hop(bk, 3.2);
      }
      batteryFlex.rotation.z = 0.5 * (ss(win(f, 1.6, 1.67)) - ss(win(f, 4.3, 4.36)));

      /* --- placa --------------------------------------------------- */
      const bd = io(win(f, 3.52, 3.8)) - io(win(f, 4.08, 4.24));
      board.position.lerpVectors(BOARD_HOME, BOARD_KNOLL, bd);
      board.position.y += hop(bd, 2.6);

      /* --- blindagens: alavancadas por uma borda, depois saem ------ */
      shields.forEach((s) => {
        const i = s.userData.i;
        const k = io(win(f, 2.4 + i * 0.05, 2.6 + i * 0.05)) - io(win(f, 3.08 + i * 0.03, 3.22 + i * 0.03));
        const pry = ss(win(k, 0, 0.4)), off = ss(win(k, 0.3, 1));
        const ang = 0.32 * pry - 0.1 * off;
        s.position.copy(s.userData.home);
        s.position.y += s.userData.hw * Math.sin(ang) + off * (0.9 + i * 0.22);
        s.position.x += off * (0.25 + (i % 2) * 0.5);
        s.rotation.z = -ang;
      });

      /* --- ferro de solda ----------------------------------------- */
      const ir = io(win(f, 2.55, 2.9)) - io(win(f, 3.06, 3.24));
      iron.position.lerpVectors(ironRest.p, ironWork.p, ir);
      iron.position.y += hop(ir, 7);
      iron.quaternion.copy(ironRest.q).slerp(ironWork.q, ir);
      ironGlow.intensity = ir > 0.9 ? (8 + Math.sin(t * 30) * 2) * (ir - 0.9) * 10 : 0;
    },
  };
}
