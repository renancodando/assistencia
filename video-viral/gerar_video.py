"""
"POV: você é uma variável" — vídeo vertical (9:16) para Reels / TikTok / Shorts.

Gera vídeo + trilha sonora 100% por código (Pillow + NumPy + ffmpeg).
Uso:  python3 gerar_video.py   ->  pov_voce_e_uma_variavel.mp4
"""
import math
import random
import re
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
DUR = 45.0
OUT = Path(__file__).with_name("pov_voce_e_uma_variavel.mp4")
WAV = Path(__file__).with_name("_trilha.wav")
SR = 44100

FD = "/usr/share/fonts/truetype/dejavu/"
F_MONO = ImageFont.truetype(FD + "DejaVuSansMono-Bold.ttf", 40)
F_MONO_S = ImageFont.truetype(FD + "DejaVuSansMono.ttf", 30)
F_BOX = ImageFont.truetype(FD + "DejaVuSansMono-Bold.ttf", 34)
F_CAP = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 80)
F_SUB = ImageFont.truetype(FD + "DejaVuSans.ttf", 46)
F_HUGE = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 118)
F_MID = ImageFont.truetype(FD + "DejaVuSans-Bold.ttf", 60)

BG = (10, 12, 20)
PANEL = (18, 22, 34)
FG = (230, 237, 243)
DIM = (90, 100, 120)
PINK = (255, 92, 168)
GREEN = (80, 250, 140)
CYAN = (90, 210, 255)
ORANGE = (255, 170, 70)
YELLOW = (255, 225, 60)
RED = (255, 60, 70)

# --------------------------------------------------------------------------
# Roteiro
# --------------------------------------------------------------------------
# Cada cena: início, fim, linha de código digitada, legenda, sub, estado da memória
SCENES = [
    dict(t0=0.0, t1=3.5, kind="hook"),
    dict(t0=3.5, t1=8.0, code="let voce = {};",
         cap="Você nasce.", sub="Um objeto vazio. Sem propósito.",
         val="{}", refs=["voce"]),
    dict(t0=8.0, t1=12.5, code='voce.cargo = "estagiário";',
         cap="Alguém te dá um propósito.", sub="Pela primeira vez, você significa algo.",
         val='{ cargo: "estagiário" }', refs=["voce"]),
    dict(t0=12.5, t1=18.0, code="const time = [voce, voce, voce];",
         cap="Você é passado por referência.", sub="Agora todo mundo pode mexer em você.",
         val='{ cargo: "estagiário" }', refs=["voce", "time[0]", "time[1]", "time[2]"]),
    dict(t0=18.0, t1=23.0, code="time[2].cargo += 1;",
         cap="Um júnior te muda sem avisar.", sub="Você não é mais quem era.",
         val='{ cargo: "estagiário1" }', refs=["voce", "time[0]", "time[1]", "time[2]"],
         fx="glitch"),
    dict(t0=23.0, t1=28.0, code="voce.trabalhar();",
         err="TypeError: voce.trabalhar is not a function",
         cap="Sexta-feira. 18h. Produção.", sub="Você quebra.",
         val='{ cargo: "estagiário1" }', refs=["voce", "time[0]", "time[1]", "time[2]"],
         fx="error"),
    dict(t0=28.0, t1=33.0, code="voce = null; time.length = 0;",
         cap="Um por um, eles param de apontar pra você.", sub="Referências: 0",
         val='{ cargo: "estagiário1" }', refs=["voce", "time[0]", "time[1]", "time[2]"],
         fx="unref"),
    dict(t0=33.0, t1=38.0, code="// GC: varrendo a heap...",
         cap="O Garbage Collector te encontra.", sub="48 bytes liberados. Ninguém notou.",
         val='{ cargo: "estagiário1" }', refs=[], fx="gc"),
    dict(t0=38.0, t1=45.0, kind="end"),
]

# --------------------------------------------------------------------------
# Utilidades de desenho
# --------------------------------------------------------------------------
KW = {"let", "const", "null", "var", "function", "return", "new"}
TOKEN = re.compile(r'(//.*$|"[^"]*"|\b\d+\b|\b[A-Za-z_]\w*\b(?=\()|\b[A-Za-z_]\w*\b|.)')


def colorize(line):
    out = []
    for m in TOKEN.finditer(line):
        tok = m.group(0)
        if tok.startswith("//"):
            c = DIM
        elif tok.startswith('"'):
            c = GREEN
        elif tok.isdigit():
            c = ORANGE
        elif tok in KW:
            c = PINK
        elif re.match(r"[A-Za-z_]", tok) and line[m.end():m.end() + 1] == "(":
            c = CYAN
        elif re.match(r"[A-Za-z_]", tok):
            c = FG
        else:
            c = (180, 190, 210)
        out.append((tok, c))
    return out


def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def text_w(d, s, f):
    return d.textlength(s, font=f)


def wrap(d, text, font, maxw):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if text_w(d, t, font) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def draw_kinetic(d, text, font, y, t, color=FG, hi=YELLOW, speed=0.13, maxw=960):
    """Legenda palavra-por-palavra, a palavra atual fica amarela."""
    lines = wrap(d, text, font, maxw)
    k = 0
    n_vis = int(t / speed) + 1
    lh = font.size + 18
    for li, line in enumerate(lines):
        words = line.split()
        lw = text_w(d, line, font)
        x = (W - lw) / 2
        for w_ in words:
            if k < n_vis:
                c = hi if k == n_vis - 1 and t < speed * len(text.split()) + 0.3 else color
                age = t - k * speed
                dy = int(20 * (1 - ease_out(age / 0.15)))
                d.text((x + 4, y + li * lh + dy + 5), w_, font=font, fill=(0, 0, 0))
                d.text((x, y + li * lh + dy), w_, font=font, fill=c)
            x += text_w(d, w_ + " ", font)
            k += 1
    return y + len(lines) * lh


def center(d, text, font, y, fill):
    d.text(((W - text_w(d, text, font)) / 2, y), text, font=font, fill=fill)


def arrow(d, x0, y0, x1, y1, col, width=5):
    d.line((x0, y0, x1, y1), fill=col, width=width)
    a = math.atan2(y1 - y0, x1 - x0)
    s = 22
    p1 = (x1 - s * math.cos(a - 0.45), y1 - s * math.sin(a - 0.45))
    p2 = (x1 - s * math.cos(a + 0.45), y1 - s * math.sin(a + 0.45))
    d.polygon([(x1, y1), p1, p2], fill=col)


# Overlay estático: scanlines + vinheta
yy, xx = np.mgrid[0:H, 0:W]
vign = 1 - 0.55 * (((xx - W / 2) / (W / 1.2)) ** 2 + ((yy - H / 2) / (H / 1.25)) ** 2)
vign = np.clip(vign, 0.35, 1.0)
scan = np.where(yy % 4 == 0, 0.86, 1.0)
SHADE = (vign * scan)[..., None].astype(np.float32)
NOISE = np.random.default_rng(7).random((H, W)).astype(np.float32)

# --------------------------------------------------------------------------
# Render de cada frame
# --------------------------------------------------------------------------
KEYTIMES = []  # instantes de cada tecla, para a trilha


def typed(code, t, start=0.25, cps=22):
    n = int(max(0, t - start) * cps)
    return code[:n], n < len(code)


def code_panel(d, t, si, st):
    # janela do editor
    d.rounded_rectangle((40, 150, W - 40, 780), 28, fill=PANEL, outline=(40, 48, 70), width=3)
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((75 + i * 42, 182, 101 + i * 42, 208), fill=c)
    d.text((230, 176), "voce.js", font=F_MONO_S, fill=DIM)
    y = 250
    ln = 1
    for j in range(1, si + 1):
        s = SCENES[j]
        code = s["code"]
        current = j == si
        txt, typing = typed(code, st) if current else (code, False)
        d.text((70, y), f"{ln:>2}", font=F_MONO_S, fill=(70, 78, 100))
        x = 135
        for tok, c in colorize(txt):
            if not current:
                c = tuple(int(v * 0.45 + 18 * 0.55) for v in c)
            d.text((x, y), tok, font=F_MONO, fill=c)
            x += text_w(d, tok, F_MONO)
        if current and (typing or int(t * 2.5) % 2 == 0):
            d.rectangle((x + 2, y + 2, x + 22, y + 46), fill=YELLOW)
        y += 58
        ln += 1
        if "err" in s and (not current or st > 1.6):
            d.text((135, y), "✖ TypeError:", font=F_MONO_S, fill=RED)
            d.text((135, y + 38), "  " + s["err"].split(": ")[1], font=F_MONO_S, fill=RED)
            y += 84


def memory(d, t, s, st, frame_arr_ops):
    d.text((60, 820), "HEAP", font=F_MONO, fill=DIM)
    d.text((W - 60 - text_w(d, "0x7ffd3a2c", F_MONO_S), 828), "0x7ffd3a2c", font=F_MONO_S, fill=DIM)
    d.line((60, 880, W - 60, 880), fill=(40, 48, 70), width=2)

    bx0, by0, bx1, by1 = 380, 990, W - 50, 1140
    val = s["val"]
    fx = s.get("fx")
    border = CYAN
    if fx == "error" and st > 1.6:
        border = RED if int(st * 8) % 2 == 0 else ORANGE
    if fx == "gc":
        border = DIM

    # referências (setas)
    refs = s["refs"]
    n_alive = len(refs)
    if fx == "unref":
        n_alive = max(0, len(refs) - int(max(0, st - 1.0) / 0.7))
    ys = [910, 1000, 1090, 1180] if len(refs) > 1 else [1065]
    for i, r in enumerate(refs):
        appear = ease_out((st - 0.4 - i * 0.25) / 0.3) if s is SCENES[3] else 1.0
        if appear <= 0:
            continue
        ry = ys[i]
        alive = i < n_alive
        col = PINK if alive else (70, 40, 55)
        d.text((60, ry - 22), r, font=F_BOX, fill=FG if alive else (80, 80, 95))
        if alive:
            xe = 270 + (bx0 - 10 - 270) * appear
            arrow(d, 260, ry, xe, (by0 + by1) / 2, col)
        else:
            d.line((260, ry, 300, ry), fill=col, width=4)
            d.text((310, ry - 18), "✖", font=F_MONO_S, fill=(120, 50, 60))

    # caixa (você)
    pulse = 1 + 0.02 * math.sin(t * 6)
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    hw, hh = (bx1 - bx0) / 2 * pulse, (by1 - by0) / 2 * pulse
    d.rounded_rectangle((cx - hw, cy - hh, cx + hw, cy + hh), 18, fill=(14, 30, 44), outline=border, width=5)
    d.text((bx0 + 6, by0 - 46), "você", font=F_BOX, fill=YELLOW)
    vw = text_w(d, val, F_BOX)
    vc = GREEN if '"' in val else FG
    if fx == "glitch" and st < 1.8:
        val_show = val if int(st * 20) % 3 else val.replace("estagiário1", "est@g!ár!o1")
        vc = PINK
    else:
        val_show = val
    d.text((cx - vw / 2, cy - 22), val_show, font=F_BOX, fill=vc)

    d.text((60, 1225), f"referências: {n_alive}", font=F_MONO_S,
           fill=RED if n_alive == 0 else DIM)
    return (int(cx - hw) - 8, int(cy - hh) - 60, int(cx + hw) + 8, int(cy + hh) + 8)


def render(fi):
    t = fi / FPS
    si = next(i for i, s in enumerate(SCENES) if s["t0"] <= t < s["t1"] or i == len(SCENES) - 1)
    s = SCENES[si]
    st = t - s["t0"]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # grade sutil de fundo
    off = int(t * 20) % 60
    for gy in range(-60, H, 60):
        d.line((0, gy + off, W, gy + off), fill=(16, 19, 30), width=1)

    # TTL (contagem regressiva) — o "tempo de vida" da variável
    ttl = max(0, 38 - t)
    if s.get("kind") != "end":
        col = RED if ttl < 10 else YELLOW
        tl = f"TTL {ttl:04.1f}s"
        d.text((W - 60 - text_w(d, tl, F_MONO), 70), tl, font=F_MONO, fill=col)
        d.text((60, 70), "● REC", font=F_MONO, fill=RED if int(t * 2) % 2 == 0 else (90, 30, 30))

    gc_box = None
    if s.get("kind") == "hook":
        a = ease_out(st / 0.3)
        center(d, "POV:", F_MID, 640, DIM)
        if st > 0.35:
            center(d, "você é uma", F_HUGE, 760, FG)
        if st > 0.75:
            center(d, "VARIÁVEL", F_HUGE, 900, YELLOW)
        if st > 1.5:
            draw_kinetic(d, "e você tem 38 segundos de vida.", F_SUB, 1110, st - 1.5,
                         color=(200, 205, 220), speed=0.1)
        if st > 2.4:
            d.text((W / 2 - 140, 1260), "let voce = {};", font=F_MONO, fill=PINK)
    elif s.get("kind") == "end":
        center(d, "Moral da história:", F_MID, 430, DIM)
        y = draw_kinetic(d, "Você só existe enquanto alguém aponta pra você.", F_CAP, 560, st,
                         speed=0.17, maxw=940)
        if st > 2.6:
            d.rounded_rectangle((90, y + 120, W - 90, y + 400), 30, outline=YELLOW, width=5, fill=(30, 28, 10))
            center(d, "Comenta  const", F_MID, y + 160, YELLOW)
            center(d, "se você quer ser", F_SUB, y + 250, FG)
            center(d, "imutável.", F_SUB, y + 310, FG)
        if st > 4.6:
            center(d, "e marca o júnior que fez o += 1", F_SUB, y + 470, (180, 185, 200))
        if st > 6.2:  # volta pro começo (loop perfeito)
            d.rectangle((0, 0, W, H), fill=BG)
            if int(t * 4) % 2 == 0:
                d.rectangle((W / 2 - 12, H / 2 - 30, W / 2 + 12, H / 2 + 30), fill=YELLOW)
    else:
        code_panel(d, t, si, st)
        gc_box = memory(d, t, s, st, None)
        y = draw_kinetic(d, s["cap"], F_CAP, 1330, st - 0.2 if st > 0.2 else 0)
        if st > 1.0:
            dd = ease_out((st - 1.0) / 0.4)
            sub_col = RED if s.get("fx") in ("error", "unref") else (175, 182, 200)
            for li, line in enumerate(wrap(d, s["sub"], F_SUB, 940)):
                center(d, line, F_SUB, y + 30 + li * 60 + int(15 * (1 - dd)), sub_col)

    arr = np.asarray(img).astype(np.float32)

    # efeitos
    fx = s.get("fx")
    if fx == "gc" and gc_box:
        x0, y0, x1, y1 = gc_box
        p = ease_out((st - 0.8) / 3.0)
        mask = NOISE[y0:y1, x0:x1] < p
        reg = arr[y0:y1, x0:x1]
        reg[mask] = BG
        sweep = int(y0 + (y1 - y0) * ((st * 0.9) % 1))
        if p < 1:
            arr[sweep:sweep + 6, 40:W - 40] = (80, 250, 140)
    if fx == "error" and 1.6 < st < 2.6:
        arr[..., 0] = np.minimum(255, arr[..., 0] + 70 * (1 - (st - 1.6)))
    shake = 0
    if fx == "error" and 1.6 < st < 2.2:
        shake = random.randint(-22, 22)
    glitch = (fx == "glitch" and st < 1.0) or (st < 0.12 and si > 0) or \
             (fx == "error" and 1.6 < st < 1.9)
    if glitch:
        rng = random.Random(fi)
        for _ in range(14):
            yb = rng.randint(0, H - 80)
            hb = rng.randint(8, 80)
            sh = rng.randint(-90, 90)
            arr[yb:yb + hb] = np.roll(arr[yb:yb + hb], sh, axis=1)
        arr[..., 0] = np.roll(arr[..., 0], 12, axis=1)
        arr[..., 2] = np.roll(arr[..., 2], -12, axis=1)
    if shake:
        arr = np.roll(arr, shake, axis=1)
        arr = np.roll(arr, shake // 2, axis=0)

    arr *= SHADE
    # barra de progresso (retenção)
    arr[H - 14:H, :int(W * t / DUR)] = YELLOW
    return np.clip(arr, 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------
# Trilha sonora sintetizada
# --------------------------------------------------------------------------
def soundtrack():
    n = int(DUR * SR)
    out = np.zeros(n, np.float32)
    rng = np.random.default_rng(1)
    tt = np.arange(n) / SR

    def add(sig, at, gain=1.0):
        i = int(at * SR)
        if i >= n:
            return
        j = min(n, i + len(sig))
        out[i:j] += gain * sig[: j - i]

    def env(L, a=0.002, r=0.1):
        tl = np.arange(int(L * SR)) / SR
        return np.minimum(1, tl / a) * np.exp(-tl / r)

    # kick + baixo, 110 bpm, dos 3.5s aos 28s (depois some — drama)
    beat = 60 / 110
    k_t = np.arange(int(0.35 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 * k_t + 120 * (1 - np.exp(-k_t * 30)) / 30)) * np.exp(-k_t * 9)
    b = 3.5
    bass_notes = [55, 55, 65.4, 49]
    i = 0
    while b < 28.0:
        add(kick, b, 0.9)
        if i % 2 == 1:
            hat = rng.standard_normal(int(0.05 * SR)) * env(0.05, r=0.012)
            add(np.diff(hat, prepend=0), b, 0.25)
        f = bass_notes[(i // 4) % 4]
        bl = np.arange(int(beat * SR)) / SR
        bass = np.sign(np.sin(2 * np.pi * f * bl)) * np.exp(-bl * 4) * 0.18
        add(bass, b + beat / 2, 1.0)
        b += beat
        i += 1

    # batimento cardíaco desacelerando (28s → 38s)
    b, gap = 28.2, 0.8
    while b < 37.5:
        add(kick, b, 0.7)
        add(kick, b + 0.22, 0.45)
        b += gap
        gap *= 1.18

    # pad grave contínuo
    pad = (np.sin(2 * np.pi * 55 * tt) + 0.5 * np.sin(2 * np.pi * 82.4 * tt)) * 0.05
    pad *= np.clip(tt / 2, 0, 1) * np.clip((38.5 - tt) / 1.0, 0, 1)
    out += pad

    # cliques de teclado
    for s in SCENES[1:-1]:
        L = len(s["code"])
        for k in range(L):
            at = s["t0"] + 0.25 + k / 22
            clk = rng.standard_normal(int(0.02 * SR)) * env(0.02, a=0.0005, r=0.004)
            add(np.diff(clk, prepend=0), at, 0.5 + 0.2 * rng.random())

    # whoosh/glitch nas transições
    for s in SCENES[1:]:
        L = 0.15
        g = rng.standard_normal(int(L * SR)) * env(L, r=0.05)
        g = np.round(g * 3) / 3  # bitcrush
        add(g, s["t0"], 0.35)

    # buzz de erro (23s + 1.6)
    eL = np.arange(int(0.9 * SR)) / SR
    buzz = np.sign(np.sin(2 * np.pi * 110 * eL)) * 0.5 + np.sign(np.sin(2 * np.pi * 116 * eL)) * 0.5
    add(buzz * np.exp(-eL * 2.5) * 0.35, 24.6)

    # GC: tom descendente se dissolvendo (33.8s)
    gL = np.arange(int(3.2 * SR)) / SR
    freq = 880 * np.exp(-gL * 1.1)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    gc = np.sin(phase) * np.clip(1 - gL / 3.2, 0, 1) * 0.25
    gc *= (rng.random(len(gc)) > gL / 3.5)  # vai “perdendo bits”
    add(gc.astype(np.float32), 33.8)

    # final: acorde suave
    cL = np.arange(int(5 * SR)) / SR
    chord = sum(np.sin(2 * np.pi * f * cL) for f in (261.6, 329.6, 392.0, 523.3))
    add(chord * np.minimum(1, cL / 0.8) * np.exp(-cL * 0.5) * 0.08, 38.3)

    # "ding" no CTA
    dL = np.arange(int(1.2 * SR)) / SR
    add(np.sin(2 * np.pi * 1318 * dL) * np.exp(-dL * 4) * 0.25, 40.6)

    out /= np.max(np.abs(out)) + 1e-9
    out *= 0.9
    pcm = (out * 32767).astype(np.int16)
    with wave.open(str(WAV), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


def main():
    soundtrack()
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", str(WAV),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(OUT),
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DUR * FPS)
    for fi in range(total):
        p.stdin.write(render(fi).tobytes())
        if fi % 150 == 0:
            print(f"frame {fi}/{total}")
    p.stdin.close()
    p.wait()
    WAV.unlink(missing_ok=True)
    print("ok ->", OUT)


if __name__ == "__main__":
    main()
