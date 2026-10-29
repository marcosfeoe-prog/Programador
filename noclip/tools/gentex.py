#!/usr/bin/env python3
"""Gerador das texturas do Noclip (todas feitas do zero, sem fotos).

Uso (na raiz do repositório):
    python3 noclip/tools/gentex.py            # gera tudo em noclip/assets/tex
    python3 noclip/tools/gentex.py l0_wall    # só as que começam com o prefixo

Cada material sai em até três arquivos: <nome>.jpg (cor), <nome>_n.jpg (mapa
normal, convenção OpenGL) e <nome>_r.jpg (rugosidade). Tudo é "tileável".
Precisa de numpy e Pillow.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex')
ONLY = sys.argv[1:]


# ---------------------------------------------------------------- ruído --
def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def perlin(h, w, py, px, rng):
    """Ruído de Perlin tileável (h x w pixels, py x px células)."""
    ang = rng.uniform(0, 2 * np.pi, (py, px))
    gx, gy = np.cos(ang), np.sin(ang)
    x = (np.arange(w) * px / w)[None, :].repeat(h, 0)
    y = (np.arange(h) * py / h)[:, None].repeat(w, 1)
    xi = np.floor(x).astype(np.int32)
    yi = np.floor(y).astype(np.int32)
    xf, yf = x - xi, y - yi
    x0, x1 = xi % px, (xi + 1) % px
    y0, y1 = yi % py, (yi + 1) % py

    def d(ix, iy, dx, dy):
        return gx[iy, ix] * dx + gy[iy, ix] * dy

    u, v = fade(xf), fade(yf)
    a = d(x0, y0, xf, yf) + u * (d(x1, y0, xf - 1, yf) - d(x0, y0, xf, yf))
    b = d(x0, y1, xf, yf - 1) + u * (d(x1, y1, xf - 1, yf - 1) - d(x0, y1, xf, yf - 1))
    return (a + v * (b - a)) * 1.4142


def fbm(h, w, py, px, rng, octaves=5, gain=0.5):
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cy, cx = py * 2 ** o, px * 2 ** o
        if cy > h or cx > w:
            break
        out += perlin(h, w, cy, cx, rng) * amp
        tot += amp
        amp *= gain
    return out / tot


def worley(h, w, g, rng, jitter=1.0):
    """Ruído celular tileável: devolve (F1, F2, id da célula). g = células no eixo x."""
    gy = max(1, round(g * h / w))
    ptx = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (gy, g))
    pty = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (gy, g))
    cid = rng.permutation(gy * g).reshape(gy, g)
    x = (np.arange(w) * g / w)[None, :].repeat(h, 0)
    y = (np.arange(h) * gy / h)[:, None].repeat(w, 1)
    cx = np.floor(x).astype(np.int32)
    cy = np.floor(y).astype(np.int32)
    f1 = np.full((h, w), 9.0)
    f2 = np.full((h, w), 9.0)
    ids = np.zeros((h, w), np.int32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            nx, ny = cx + ox, cy + oy
            wx, wy = nx % g, ny % gy
            px = nx + ptx[wy, wx]
            pyy = ny + pty[wy, wx]
            dd = np.sqrt((px - x) ** 2 + (pyy - y) ** 2)
            closer = dd < f1
            f2 = np.where(closer, f1, np.minimum(f2, dd))
            ids = np.where(closer, cid[wy, wx], ids)
            f1 = np.where(closer, dd, f1)
    return f1, f2, ids


def blur(a, r):
    """Desfoque gaussiano tileável (separável, por rolagem)."""
    if r <= 0:
        return a
    k = np.arange(-int(r * 2.5), int(r * 2.5) + 1)
    wts = np.exp(-(k ** 2) / (2 * r * r))
    wts /= wts.sum()
    out = np.zeros_like(a)
    for i, wv in zip(k, wts):
        out += np.roll(a, i, axis=1) * wv
    a = out
    out = np.zeros_like(a)
    for i, wv in zip(k, wts):
        out += np.roll(a, i, axis=0) * wv
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(hgt, strength):
    du = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
    dr = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    nx, ny, nz = -du * strength, dr * strength, np.ones_like(hgt)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5


def rgb(c):
    return np.array(c, dtype=np.float64) / 255.0


def save(name, arr, q=90):
    path = os.path.join(OUT, name)
    arr = np.clip(arr, 0, 1)
    if arr.ndim == 2:
        img = Image.fromarray(np.uint8(arr * 255 + 0.5), 'L')
    elif arr.shape[2] == 4:
        img = Image.fromarray(np.uint8(arr * 255 + 0.5), 'RGBA')
    else:
        img = Image.fromarray(np.uint8(arr * 255 + 0.5), 'RGB')
    if path.endswith('.png'):
        img.save(path, optimize=True)
    else:
        img.save(path, quality=q, subsampling=0 if q >= 90 else 2)
    print('  ', name, img.size)


def want(name):
    return not ONLY or any(name.startswith(p) for p in ONLY)


def tint(base, *mods):
    """base: cor (3,), mods: mapas multiplicativos (h,w) → imagem (h,w,3)."""
    m = np.ones_like(mods[0])
    for x in mods:
        m = m * x
    return m[..., None] * base[None, None, :]


# ------------------------------------------------- traços "à mão livre" --
def jitter_path(pts, rng, amt):
    return [(x + rng.normal(0, amt), y + rng.normal(0, amt)) for x, y in pts]


def subdivide(pts, step):
    out = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        for i in range(n):
            t = i / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    out.append(pts[-1])
    return out


def wobble(pts, rng, amt, step=6):
    """Subdivide e aplica um tremor suave (mão de criança / pincel atômico)."""
    pts = subdivide(pts, step)
    n = len(pts)
    off = np.cumsum(rng.normal(0, amt, (n, 2)), 0)
    off -= np.linspace(0, 1, n)[:, None] * off[-1]
    off = np.array([np.convolve(off[:, i], np.ones(5) / 5, 'same') for i in range(2)]).T
    return [(x + off[i, 0], y + off[i, 1]) for i, (x, y) in enumerate(pts)]


def stroke(draw, pts, width, fill):
    if len(pts) < 2:
        return
    draw.line(pts, fill=fill, width=int(width), joint='curve')
    r = width / 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def circle_pts(cx, cy, rx, ry, n=48, a0=0.0, a1=2 * math.pi):
    return [(cx + rx * math.cos(a0 + (a1 - a0) * i / n), cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


LETTERS = {
    'F': [[(0, 1), (0, 0), (0.85, 0)], [(0, 0.48), (0.65, 0.48)]],
    'U': [[(0, 0), (0, 0.7), (0.12, 0.92), (0.5, 1.0), (0.88, 0.92), (1, 0.7), (1, 0)]],
    'N': [[(0, 1), (0, 0), (1, 1), (1, 0)]],
    'E': [[(0.9, 0), (0, 0), (0, 1), (0.9, 1)], [(0, 0.5), (0.7, 0.5)]],
    'X': [[(0, 0), (1, 1)], [(1, 0), (0, 1)]],
    'I': [[(0.5, 0), (0.5, 1)]],
    'T': [[(0, 0), (1, 0)], [(0.5, 0), (0.5, 1)]],
    'P': [[(0, 1), (0, 0), (0.7, 0), (0.95, 0.13), (0.95, 0.37), (0.7, 0.5), (0, 0.5)]],
    'A': [[(0, 1), (0.5, 0), (1, 1)], [(0.22, 0.62), (0.78, 0.62)]],
    'R': [[(0, 1), (0, 0), (0.7, 0), (0.95, 0.13), (0.95, 0.37), (0.7, 0.5), (0, 0.5)], [(0.4, 0.5), (1, 1)]],
    'Y': [[(0, 0), (0.5, 0.5), (1, 0)], [(0.5, 0.5), (0.5, 1)]],
    'H': [[(0, 0), (0, 1)], [(1, 0), (1, 1)], [(0, 0.5), (1, 0.5)]],
    'O': [None],
    'S': [[(0.95, 0.12), (0.75, 0), (0.25, 0), (0.03, 0.15), (0.05, 0.38), (0.5, 0.5), (0.95, 0.62), (0.97, 0.86), (0.75, 1), (0.2, 1), (0, 0.88)]],
    'D': [[(0, 0), (0, 1), (0.55, 1), (0.92, 0.8), (1, 0.5), (0.92, 0.2), (0.55, 0), (0, 0)]],
    'L': [[(0, 0), (0, 1), (0.85, 1)]],
    'W': [[(0, 0), (0.22, 1), (0.5, 0.35), (0.78, 1), (1, 0)]],
    'B': [[(0, 0), (0, 1), (0.7, 1), (0.95, 0.85), (0.95, 0.62), (0.7, 0.5), (0, 0.5)], [(0, 0), (0.62, 0), (0.88, 0.12), (0.88, 0.38), (0.62, 0.5)]],
    '0': [None], '7': [[(0, 0), (1, 0), (0.35, 1)]],
}


def write(draw, text, x, y, size, width, fill, rng, spacing=0.3, slant=0.0, wob=1.4):
    """Escreve com traços tremidos (letra de pincel atômico)."""
    for ch in text:
        if ch == ' ':
            x += size * 0.6
            continue
        sx = size * (0.55 if ch in 'I' else 0.75)
        strokes = LETTERS.get(ch)
        if strokes == [None]:
            strokes = [circle_pts(0.5, 0.5, 0.5, 0.5, 28)]
        for s in strokes:
            pts = [(x + (px - py * slant) * sx, y + py * size) for px, py in s]
            stroke(draw, wobble(pts, rng, wob, 5), width * rng.uniform(0.85, 1.15), fill)
        x += sx + size * spacing
    return x


def crayon_mask(h, w, rng, density=0.55):
    g = perlin(h, w, h // 3, w // 3, rng) * 0.6 + perlin(h, w, h // 8, w // 8, rng) * 0.4
    return smooth(-density, 0.4 - density * 0.4, g)


# ================================================================ NÍVEL 0 ==
def l0_wall():
    S = 1024  # 1,0 m x 1,0 m
    rng = np.random.default_rng(11)
    x = np.arange(S)[None, :].repeat(S, 0)
    y = np.arange(S)[:, None].repeat(S, 1)
    # listras verticais: larga lisa (40 px) e estreita com divisas (24 px)
    sx = x % 64
    narrow = (sx >= 40).astype(np.float64)
    edge = ((sx == 40) | (sx == 63) | (sx == 0)).astype(np.float64)
    # motivo: pequenas setas/chevrons na faixa estreita a cada 32 px
    cy = (y % 32) - 16
    cx = np.abs(sx - 52)
    chev = ((np.abs(cy + cx * 0.9 - 4) < 1.6) & (cx < 8) & (narrow > 0)).astype(np.float64)
    pattern = 1 - 0.035 * narrow - 0.06 * chev - 0.03 * edge
    # fibra do papel (fina) e estrias verticais
    fiber = fbm(S, S, 128, 128, rng, 3) * 0.03
    streak = perlin(S, S, 8, 256, rng) * 0.02
    mott = fbm(S, S, 3, 3, rng, 5) * 0.05
    # rolos de papel de 0,5 m com emendas
    seam_d = np.minimum(x % 512, 512 - (x % 512))
    seam_light = np.exp(-((x % 512) - 1.0) ** 2 / 1.2) * 0.09
    seam_shadow = np.exp(-(((x % 512) - 4.0) ** 2) / 6.0) * 0.05
    roll = np.where((x // 512) % 2 == 0, 1.0, 0.985)
    lum = pattern * roll * (1 + fiber + streak + mott) + seam_light - seam_shadow
    # leve amarelado / sujeira nas partes escuras do mottling
    base = rgb((201, 184, 106))
    dirt = smooth(-0.2, 0.5, fbm(S, S, 3, 3, rng, 5))
    col = tint(base, lum)
    col = col * (1 - dirt[..., None] * np.array([0.02, 0.035, 0.08])[None, None, :])
    save('l0_wall.jpg', col)
    hgt = -0.4 * narrow - 0.8 * chev + fiber * 6 + streak * 4 - np.exp(-seam_d ** 2 / 3.0) * 0.6 + np.exp(-((x % 512) - 2.0) ** 2 / 1.5) * 1.2
    save('l0_wall_n.jpg', normal_from_height(hgt, 1.6))
    rough = 0.82 + 0.06 * narrow + fbm(S, S, 16, 16, rng, 3) * 0.06
    save('l0_wall_r.jpg', rough)


def carpet_base(S, rng, cells, tuft_amp=0.16):
    f1, f2, ids = worley(S, S, cells, rng, 0.9)
    tuft = 1 - np.clip(f1 * 1.5, 0, 1)
    rnd = (ids % 997) / 997.0
    fiber = fbm(S, S, 256, 256, rng, 2) * 0.08
    lum = 1 + (rnd - 0.5) * tuft_amp + (tuft - 0.5) * 0.18 + fiber
    hgt = tuft * 1.0 + fiber * 4 + rnd * 0.3
    return lum, hgt


def l0_carpet():
    S = 1024  # 1,6 m
    rng = np.random.default_rng(21)
    lum, hgt = carpet_base(S, rng, 170)
    mott = fbm(S, S, 3, 3, rng, 5)
    damp = smooth(-0.15, 0.5, fbm(S, S, 3, 3, rng, 5))
    lum = lum * (1 + mott * 0.06) * (1 - damp * 0.12)
    base = rgb((136, 116, 66))
    col = tint(base, lum)
    col = col * (1 - damp[..., None] * np.array([0.0, 0.03, 0.12])[None, None, :])
    save('l0_carpet.jpg', col)
    save('l0_carpet_n.jpg', normal_from_height(hgt, 2.2))
    save('l0_carpet_r.jpg', 0.96 - damp * 0.12 + fbm(S, S, 64, 64, rng, 2) * 0.03)


def ceiling_tiles(name, base_c, seed):
    S = 1024  # 1,2 m = 2 x 2 placas de 0,6 m
    rng = np.random.default_rng(seed)
    x = np.arange(S)[None, :].repeat(S, 0)
    y = np.arange(S)[:, None].repeat(S, 1)
    dx = np.minimum(x % 512, 512 - (x % 512))
    dy = np.minimum(y % 512, 512 - (y % 512))
    d = np.minimum(dx, dy)
    bar = (d < 10).astype(np.float64)
    bevel = smooth(10, 22, d)
    # fissuras (vermiculado) e furinhos
    n1 = fbm(S, S, 24, 24, rng, 3)
    fiss = (np.abs(n1) < 0.035).astype(np.float64) * (fbm(S, S, 12, 12, rng, 2) > -0.1)
    fiss = blur(fiss, 0.7)
    holes = np.zeros((S, S))
    hx = rng.integers(0, S, 9000)
    hy = rng.integers(0, S, 9000)
    holes[hy, hx] = 1
    holes = np.clip(blur(holes, 0.8) * 4, 0, 1)
    tile_id = (x // 512) + 2 * (y // 512)
    tone = np.choose(tile_id, [1.0, 0.975, 0.99, 0.965])
    grain = fbm(S, S, 96, 96, rng, 3) * 0.04
    mott = fbm(S, S, 6, 6, rng, 4) * 0.05
    lum_tile = tone * (1 + grain + mott) * (1 - 0.16 * fiss - 0.22 * holes) * (0.7 + 0.3 * bevel)
    lum_bar = 1.06 + grain * 0.3
    lum = np.where(bar > 0, lum_bar, lum_tile)
    col = tint(rgb(base_c), lum)
    barcol = rgb((226, 222, 210))
    col = np.where(bar[..., None] > 0, barcol[None, None, :] * lum[..., None], col)
    save(name + '.jpg', col)
    hgt = bar * 3.0 + bevel * 0.0 - (1 - bevel) * (1 - bar) * 1.5 - fiss * 1.2 - holes * 1.5 + grain * 5
    save(name + '_n.jpg', normal_from_height(blur(hgt, 0.6), 2.0))
    save(name + '_r.jpg', np.where(bar > 0, 0.45, 0.95) + grain)


def l0_ceiling():
    ceiling_tiles('ceiling', (206, 199, 168), 31)


def panel():
    """Difusor prismático da luminária (256 px = 0,6 m)."""
    S = 256
    x = np.arange(S)[None, :].repeat(S, 0)
    y = np.arange(S)[:, None].repeat(S, 1)
    px = (x % 8) / 8.0 - 0.5
    py = (y % 8) / 8.0 - 0.5
    pyr = 1 - np.maximum(np.abs(px), np.abs(py)) * 1.6
    lum = 0.86 + 0.14 * pyr
    save('panel.jpg', np.stack([lum, lum, lum * 0.97], -1))


# ================================================================ NÍVEL 1 ==
def l1_floor():
    S = 1024  # 4 m x 4 m
    rng = np.random.default_rng(41)
    x = np.arange(S)[None, :].repeat(S, 0)
    y = np.arange(S)[:, None].repeat(S, 1)
    trowel = fbm(S, S, 3, 3, rng, 6)
    swirl = perlin(S, S, 10, 10, rng) * 0.5 + perlin(S, S, 20, 20, rng) * 0.25
    agg = np.zeros((S, S))
    n = 26000
    agg[rng.integers(0, S, n), rng.integers(0, S, n)] = rng.uniform(-1, 1, n)
    agg = blur(agg, 0.7) * 2.2
    # juntas serradas a cada 2 m
    jd = np.minimum(np.minimum(x % 512, 512 - x % 512), np.minimum(y % 512, 512 - y % 512))
    joint = np.exp(-(jd ** 2) / 2.0)
    joint_edge = np.exp(-((jd - 3.0) ** 2) / 3.0)
    # rachaduras: passeios aleatórios
    img = Image.new('L', (S, S), 0)
    dr = ImageDraw.Draw(img)
    for _ in range(7):
        px0, py0 = rng.uniform(0, S, 2)
        a = rng.uniform(0, 2 * math.pi)
        pts = [(px0, py0)]
        for _ in range(int(rng.uniform(40, 120))):
            a += rng.normal(0, 0.35)
            px0 += math.cos(a) * 5
            py0 += math.sin(a) * 5
            pts.append((px0, py0))
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                dr.line([(p[0] + ox, p[1] + oy) for p in pts], fill=255, width=1)
    crack = np.asarray(img, np.float64) / 255.0
    crack = np.clip(blur(crack, 0.6) * 1.1, 0, 1) * (0.5 + 0.5 * smooth(-0.3, 0.3, perlin(S, S, 32, 32, rng)))
    oil = smooth(0.05, 0.6, fbm(S, S, 4, 4, rng, 5))
    wet = smooth(0.0, 0.3, fbm(S, S, 4, 4, rng, 5))
    lum = (1 + trowel * 0.12 + swirl * 0.04 + agg * 0.05) * (1 - 0.45 * joint) * (1 + 0.05 * joint_edge) * (1 - 0.35 * crack) * (1 - oil * 0.22)
    col = tint(rgb((128, 127, 121)), lum)
    col = col * (1 - oil[..., None] * np.array([0.0, 0.03, 0.08])[None, None, :])
    save('l1_floor.jpg', col)
    hgt = -joint * 2.0 - crack * 1.5 + agg * 0.6 + swirl * 0.8
    save('l1_floor_n.jpg', normal_from_height(blur(hgt, 0.5), 1.2))
    rough = 0.62 + trowel * 0.12 - oil * 0.22 - wet * 0.3 + joint * 0.2
    save('l1_floor_r.jpg', np.clip(rough, 0.12, 1))


def l1_wall():
    S = 1024  # 1,6 m x 1,6 m (blocos de 40 x 20 cm, junta em amarração)
    rng = np.random.default_rng(51)
    x = np.arange(S)[None, :].repeat(S, 0)
    y = np.arange(S)[:, None].repeat(S, 1)
    row = y // 128
    xo = (x + (row % 2) * 128) % S
    col_i = xo // 256
    bx = xo % 256
    byy = y % 128
    dm = np.minimum(np.minimum(bx, 255 - bx), np.minimum(byy, 127 - byy))
    mortar = smooth(4.5, 2.5, dm)
    face = smooth(3, 9, dm)
    bid = (row * 7 + col_i * 13) % 17
    btone = 1 + (bid / 17.0 - 0.5) * 0.06
    pores = np.zeros((S, S))
    n = 60000
    pores[rng.integers(0, S, n), rng.integers(0, S, n)] = 1
    pores = np.clip(blur(pores, 0.7) * 3, 0, 1)
    grain = fbm(S, S, 128, 128, rng, 3)
    mott = fbm(S, S, 5, 5, rng, 4)
    lum = btone * (1 + grain * 0.05 + mott * 0.06) * (1 - 0.25 * pores) * (1 - 0.12 * mortar)
    col = tint(rgb((170, 172, 160)), lum)
    save('l1_wall.jpg', col)
    hgt = face * 2.5 - pores * 0.8 + grain * 0.8
    save('l1_wall_n.jpg', normal_from_height(blur(hgt, 0.8), 1.5))
    save('l1_wall_r.jpg', 0.78 + grain * 0.06 + mortar * 0.08)


def l1_ceiling():
    S = 1024  # 2 m, chapa corrugada
    rng = np.random.default_rng(61)
    x = np.arange(S)[None, :].repeat(S, 0)
    period = S / 14
    t = (x % period) / period
    prof = np.clip(np.abs(t - 0.5) * 4 - 0.6, 0, 1)
    rust = smooth(0.15, 0.6, fbm(S, S, 5, 5, rng, 5)) * 0.6
    streak = perlin(S, S, 3, 40, rng) * 0.06
    mott = fbm(S, S, 6, 6, rng, 4) * 0.08
    lum = (1 + mott + streak) * (0.85 + 0.15 * prof)
    col = tint(rgb((78, 80, 82)), lum)
    col = col * (1 - rust[..., None]) + rust[..., None] * tint(rgb((98, 64, 40)), lum)
    save('l1_ceiling.jpg', col)
    save('l1_ceiling_n.jpg', normal_from_height(blur(prof * 6 + mott * 2, 1.5), 2.0))
    save('l1_ceiling_r.jpg', 0.55 + rust * 0.35 + mott)


def wood():
    S = 512  # 0,5 m, quatro tábuas
    rng = np.random.default_rng(71)
    x = np.arange(S)[None, :].repeat(S, 0)
    y = np.arange(S)[:, None].repeat(S, 1)
    plank = y // 128
    py = y % 128
    warp = perlin(S, S, 4, 2, rng) * 18
    grain = np.sin((y + warp + plank * 37) * 0.55 + perlin(S, S, 16, 4, rng) * 3.0)
    fine = perlin(S, S, 64, 4, rng)
    gap = smooth(2.5, 0.5, np.minimum(py, 127 - py))
    ptone = np.choose(plank % 4, [1.0, 0.92, 1.06, 0.96])
    knots = np.zeros((S, S))
    for _ in range(3):
        kx, ky = rng.uniform(0, S), rng.uniform(0, S)
        r = np.sqrt(((x - kx + S / 2) % S - S / 2) ** 2 * 0.3 + ((y - ky + S / 2) % S - S / 2) ** 2)
        knots += np.exp(-r ** 2 / 60) * 0.5
    lum = ptone * (1 + grain * 0.06 + fine * 0.05) * (1 - knots) * (1 - gap * 0.6)
    col = tint(rgb((168, 132, 88)), lum)
    save('wood.jpg', col)
    save('wood_n.jpg', normal_from_height(-gap * 3 + grain * 0.3 + fine * 0.4, 1.5))
    save('wood_r.jpg', 0.8 + fine * 0.05)


def cardboard():
    S = 512
    rng = np.random.default_rng(81)
    y = np.arange(S)[:, None].repeat(S, 1)
    flute = np.sin(y * 2 * math.pi / 9.0) * 0.5 + 0.5
    mott = fbm(S, S, 6, 6, rng, 5)
    fib = fbm(S, S, 128, 128, rng, 2)
    lum = (1 + mott * 0.08 + fib * 0.04) * (0.98 + 0.02 * flute)
    col = tint(rgb((160, 122, 80)), lum)
    save('cardboard.jpg', col)
    save('cardboard_n.jpg', normal_from_height(flute * 0.6 + fib * 1.5, 1.0))


# ============================================================= NÍVEL FUN ==
CONFETTI = [(60, 172, 72), (232, 192, 44), (52, 96, 214), (214, 52, 52), (150, 76, 198), (232, 124, 40), (40, 182, 196), (236, 112, 176)]


def fun_carpet():
    S = 1024  # 2 m
    rng = np.random.default_rng(91)
    lum, hgt = carpet_base(S, rng, 150, 0.12)
    lum = lum * (1 + fbm(S, S, 4, 4, rng, 4) * 0.08)
    base = tint(rgb((70, 16, 26)), lum)
    B = 2 * S
    layer = Image.new('RGBA', (B, B), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    for i in range(95):
        c = CONFETTI[rng.integers(len(CONFETTI))]
        kind = rng.choice(['squig', 'squig', 'tri', 'ring', 'sq', 'dot', 'dot', 'bar'])
        cx, cy = rng.uniform(0, B, 2)
        a = rng.uniform(0, 2 * math.pi)
        sz = rng.uniform(80, 150)
        ca, sa = math.cos(a), math.sin(a)

        def rot(px, py):
            return (cx + px * ca - py * sa, cy + px * sa + py * ca)

        for ox in (-B, 0, B):
            for oy in (-B, 0, B):
                def R(px, py):
                    q = rot(px, py)
                    return (q[0] + ox, q[1] + oy)
                if kind == 'squig':
                    pts = [R(t * sz * 2.2 - sz * 1.1, math.sin(t * math.pi * 3) * sz * 0.22) for t in np.linspace(0, 1, 28)]
                    stroke(dr, pts, 24, c + (255,))
                elif kind == 'tri':
                    p = [R(0, -sz * 0.6), R(sz * 0.55, sz * 0.4), R(-sz * 0.55, sz * 0.4), R(0, -sz * 0.6)]
                    dr.line(p, fill=c + (255,), width=20, joint='curve')
                elif kind == 'ring':
                    p = [R(math.cos(t) * sz * 0.45, math.sin(t) * sz * 0.45) for t in np.linspace(0, 2 * math.pi, 30)]
                    dr.line(p, fill=c + (255,), width=20, joint='curve')
                elif kind == 'sq':
                    p = [R(-sz * 0.3, -sz * 0.3), R(sz * 0.3, -sz * 0.3), R(sz * 0.3, sz * 0.3), R(-sz * 0.3, sz * 0.3)]
                    dr.polygon(p, fill=c + (255,))
                elif kind == 'bar':
                    p = [R(-sz * 0.6, -11), R(sz * 0.6, -11), R(sz * 0.6, 11), R(-sz * 0.6, 11)]
                    dr.polygon(p, fill=c + (255,))
                else:
                    q = R(0, 0)
                    r = sz * 0.17
                    dr.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=c + (255,))
    layer = layer.resize((S, S), Image.LANCZOS)
    lay = np.asarray(layer, np.float64) / 255.0
    a = lay[..., 3:4] * np.clip(0.75 + (lum[..., None] - 1) * 2.5, 0, 1)
    shp = lay[..., :3] * (lum[..., None] * 0.9)
    col = base * (1 - a) + shp * a
    save('fun_carpet.jpg', col)
    save('fun_carpet_n.jpg', normal_from_height(hgt, 2.2))
    save('fun_carpet_r.jpg', 0.95 + fbm(S, S, 64, 64, rng, 2) * 0.03)


def fun_wall():
    S = 1024  # 2 m
    rng = np.random.default_rng(101)
    f1, _, _ = worley(S, S, 200, rng)
    peel = 1 - np.clip(f1 * 1.4, 0, 1)
    mott = fbm(S, S, 4, 4, rng, 5)
    grain = fbm(S, S, 128, 128, rng, 2)
    scuff = smooth(0.25, 0.5, fbm(S, S, 10, 10, rng, 4))
    lum = (1 + mott * 0.07 + grain * 0.025 + peel * 0.03) * (1 - scuff * 0.08)
    col = tint(rgb((200, 176, 88)), lum)
    save('fun_wall.jpg', col)
    save('fun_wall_n.jpg', normal_from_height(peel * 1.0 + grain * 1.5, 1.2))
    save('fun_wall_r.jpg', 0.72 + grain * 0.05 + scuff * 0.1)


def drawings():
    """Atlas 4x2 de desenhos de giz de cera (transparente)."""
    C = 512
    W, H = C * 4, C * 2
    rng = np.random.default_rng(111)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    RED, BLU, GRN, ORG, PUR, BLK, WHT, PNK, YEL = (200, 40, 40), (40, 70, 190), (40, 150, 60), (230, 120, 30), (120, 50, 160), (30, 26, 24), (238, 236, 228), (226, 100, 160), (240, 200, 40)

    def S(pts, col, w=12, ox=0, oy=0, amt=1.2):
        stroke(dr, wobble([(x + ox, y + oy) for x, y in pts], rng, amt), w, col + (255,))

    # 0: festeiro (corpo alto, braços abertos, sorriso)
    ox, oy = 0, 0
    body = circle_pts(256, 150, 70, 70, 30, math.pi, 2 * math.pi) + [(326, 440), (186, 440), (186, 150)]
    S(body, ORG, 14, ox, oy)
    S([(190, 260), (70, 200), (40, 170)], ORG, 12, ox, oy)
    S([(322, 260), (450, 210), (480, 180)], ORG, 12, ox, oy)
    S([(196, 440), (196, 480)], ORG, 12, ox, oy)
    S([(316, 440), (316, 480)], ORG, 12, ox, oy)
    for ex in (232, 280):
        dr.ellipse((ex - 9, 150, ex + 9, 170), fill=BLK + (255,))
    S(circle_pts(256, 175, 45, 40, 20, 0.25, math.pi - 0.25), BLK, 9, ox, oy)
    # 1: balões
    ox = C
    for (bx, by, c) in ((200, 150, RED), (300, 130, BLU), (250, 220, GRN), (350, 230, YEL)):
        S(circle_pts(bx, by, 52, 64, 30), c, 13, ox, oy)
        S([(bx, by + 64), (bx + 10, by + 90), (256 + (bx - 256) * 0.1, 470)], BLK, 5, ox, oy, 2.5)
    # 2: sol sorridente
    ox = 2 * C
    S(circle_pts(256, 230, 100, 100, 40), YEL, 16, ox, oy)
    for k in range(12):
        a = k * math.pi / 6
        S([(256 + math.cos(a) * 125, 230 + math.sin(a) * 125), (256 + math.cos(a) * 190, 230 + math.sin(a) * 190)], ORG, 13, ox, oy)
    dr.ellipse((2 * C + 210, 190, 2 * C + 232, 214), fill=BLK + (255,))
    dr.ellipse((2 * C + 280, 190, 2 * C + 302, 214), fill=BLK + (255,))
    S(circle_pts(256, 250, 55, 45, 20, 0.2, math.pi - 0.2), RED, 10, ox, oy)
    # 3: pássaro com chapéu de festa (branco e laranja)
    ox = 3 * C
    S(circle_pts(250, 300, 110, 130, 40), WHT, 18, ox, oy)
    S(circle_pts(250, 150, 70, 64, 30), WHT, 18, ox, oy)
    S([(310, 150), (400, 170), (312, 188)], ORG, 14, ox, oy)
    dr.ellipse((3 * C + 262, 128, 3 * C + 286, 152), fill=BLK + (255,))
    S([(205, 95), (250, 10), (285, 92), (205, 95)], RED, 14, ox, oy)
    S([(225, 60), (270, 62)], YEL, 9, ox, oy)
    S([(220, 430), (215, 490), (190, 500)], ORG, 12, ox, oy)
    S([(280, 430), (285, 490), (310, 500)], ORG, 12, ox, oy)
    S([(140, 300), (90, 250)], WHT, 16, ox, oy)
    # 4: casa e família de palitos
    ox, oy = 0, C
    S([(90, 250), (90, 430), (300, 430), (300, 250), (90, 250), (195, 140), (300, 250)], RED, 13, ox, oy)
    S([(170, 430), (170, 340), (220, 340), (220, 430)], BLU, 11, ox, oy)
    for k, fx in enumerate((350, 410, 460)):
        hh = 1.0 if k < 2 else 0.7
        S(circle_pts(fx, 470 - 170 * hh, 18 * hh, 18 * hh, 16), BLK, 8, ox, oy)
        S([(fx, 488 - 170 * hh), (fx, 470 - 70 * hh)], BLK, 8, ox, oy)
        S([(fx - 30 * hh, 470 - 70 * hh + 40 * hh), (fx, 470 - 70 * hh), (fx + 30 * hh, 470 - 70 * hh + 40 * hh)], BLK, 8, ox, oy)
        S([(fx - 32 * hh, 500 - 140 * hh), (fx + 32 * hh, 500 - 140 * hh)], BLK, 8, ox, oy)
    # 5: carinha =) e PARTY
    ox = C
    S([(150, 160), (200, 160)], PUR, 22, ox, oy)
    S([(150, 230), (200, 230)], PUR, 22, ox, oy)
    S(circle_pts(250, 195, 90, 120, 26, -1.2, 1.2), PUR, 20, ox, oy)
    write(dr, 'PARTY', C + 90, C + 360, 90, 13, PNK + (255,), rng)
    # 6: bolo com velas
    ox = 2 * C
    S([(120, 470), (120, 330), (392, 330), (392, 470), (120, 470)], PNK, 14, ox, oy)
    S([(150, 330), (150, 250), (362, 250), (362, 330)], WHT, 14, ox, oy)
    S([(120, 400), (392, 400)], RED, 10, ox, oy)
    for cx in (190, 256, 322):
        S([(cx, 250), (cx, 180)], BLU, 10, ox, oy)
        S(circle_pts(cx, 160, 12, 20, 12), ORG, 9, ox, oy)
    # 7: palitos de mãos dadas e corações
    ox = 3 * C
    for k, fx in enumerate((150, 256, 362)):
        c = (GRN, BLU, RED)[k]
        S(circle_pts(fx, 220, 34, 34, 18), c, 10, ox, oy)
        S([(fx, 254), (fx, 380)], c, 10, ox, oy)
        S([(fx - 52, 320), (fx, 290), (fx + 52, 320)], c, 10, ox, oy)
        S([(fx - 40, 470), (fx, 380), (fx + 40, 470)], c, 10, ox, oy)
    for hx in (205, 310):
        S([(hx, 140), (hx - 20, 110), (hx - 6, 96), (hx, 110), (hx + 6, 96), (hx + 20, 110), (hx, 140)], RED, 8, ox, oy)
    a = np.asarray(img, np.float64) / 255.0
    a[..., 3] *= crayon_mask(H, W, rng, 0.45)
    a[..., 3] = np.clip(a[..., 3] * 0.92, 0, 1)
    save('drawings.png', a)


def fun_exit():
    """Porta "FUN EXIT" pintada à mão (512 x 1024 = 0,9 m x 2,1 m)."""
    W, H = 512, 1024
    rng = np.random.default_rng(121)
    mott = fbm(H, W, 6, 3, rng, 5)
    grain = fbm(H, W, 128, 64, rng, 2)
    y = np.arange(H)[:, None].repeat(W, 1)
    x = np.arange(W)[None, :].repeat(H, 0)
    lum = (1 + mott * 0.05 + grain * 0.02) * (1 - 0.18 * smooth(820, 1020, y) * (fbm(H, W, 8, 4, rng, 3) * 0.5 + 0.6))
    # moldura de painel em relevo
    inset = np.minimum(np.minimum(x - 40, W - 40 - x), np.minimum(y - 40, H - 40 - y))
    groove = np.exp(-(inset ** 2) / 8.0) * (inset > -20)
    col = tint(rgb((226, 224, 212)), lum * (1 - groove * 0.12))
    img = Image.fromarray(np.uint8(np.clip(col, 0, 1) * 255)).convert('RGBA')
    ink = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(ink)
    RED, PUR, BLU = (196, 34, 40, 255), (126, 60, 170, 255), (60, 70, 170, 255)
    write(dr, 'FUN', 92, 120, 104, 16, RED, rng, 0.3)
    stroke(dr, wobble(circle_pts(280, 330, 90, 60, 24, 0.3, math.pi - 0.3), rng, 1.5), 15, RED)
    stroke(dr, wobble([(230, 270), (234, 300)], rng, 1), 14, RED)
    stroke(dr, wobble([(320, 270), (324, 300)], rng, 1), 14, RED)
    write(dr, 'EXIT', 62, 500, 104, 16, RED, rng, 0.25)
    write(dr, 'PARTY', 60, 700, 56, 9, PUR, rng, 0.25)
    stroke(dr, wobble(circle_pts(400, 720, 46, 46, 24), rng, 1.5), 7, BLU)
    stroke(dr, wobble([(380, 710), (382, 716)], rng, 0.5), 6, BLU)
    stroke(dr, wobble([(414, 710), (416, 716)], rng, 0.5), 6, BLU)
    stroke(dr, wobble(circle_pts(400, 730, 24, 14, 12, 0.2, math.pi - 0.2), rng, 0.8), 6, BLU)
    stroke(dr, wobble([(90, 800), (150, 790), (210, 812)], rng, 2), 7, PUR)
    stroke(dr, wobble([(150, 380), (175, 355), (190, 395)], rng, 1.5), 6, BLU)
    a = np.asarray(ink, np.float64) / 255.0
    a[..., 3] *= crayon_mask(H, W, rng, 0.75)
    ink = Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255), 'RGBA')
    img.alpha_composite(ink)
    save('fun_exit.jpg', np.asarray(img.convert('RGB'), np.float64) / 255.0)


def cloth():
    S = 512  # 1 m, toalha de plástico (cor aplicada no material)
    rng = np.random.default_rng(131)
    wr = perlin(S, S, 3, 6, rng) * 0.6 + perlin(S, S, 6, 12, rng) * 0.3 + perlin(S, S, 12, 2, rng) * 0.4
    fold = np.abs(perlin(S, S, 2, 5, rng))
    hgt = wr * 4 + smooth(0.0, 0.08, fold) * 2
    lum = 1 + fbm(S, S, 8, 8, rng, 3) * 0.04 - (1 - smooth(0.0, 0.06, fold)) * 0.08
    save('cloth.jpg', np.stack([lum] * 3, -1) * 0.92)
    save('cloth_n.jpg', normal_from_height(blur(hgt, 2), 2.5))


# ================================================================ COMUNS ==
def metal_door():
    W, H = 512, 1024  # 0,95 m x 2,1 m
    rng = np.random.default_rng(141)
    x = np.arange(W)[None, :].repeat(H, 0)
    y = np.arange(H)[:, None].repeat(W, 1)
    mott = fbm(H, W, 6, 3, rng, 5)
    brush = perlin(H, W, 256, 4, rng) * 0.02
    scr = np.zeros((H, W))
    img = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(img)
    for _ in range(90):
        sx, sy = rng.uniform(0, W), rng.uniform(0, H)
        a = rng.uniform(0, math.pi)
        ln = rng.uniform(8, 60)
        dr.line([(sx, sy), (sx + math.cos(a) * ln, sy + math.sin(a) * ln)], fill=int(rng.uniform(80, 255)), width=1)
    scr = np.asarray(img, np.float64) / 255.0
    rust = smooth(0.3, 0.65, fbm(H, W, 10, 5, rng, 4) + smooth(900, 1024, y) * 0.35) * 0.75
    kick = (y > 860).astype(np.float64)
    edge = np.minimum(np.minimum(x, W - 1 - x), np.minimum(y, H - 1 - y))
    bev = smooth(0, 10, edge)
    hazard = ((y > 760) & (y < 800)).astype(np.float64)
    stripe = (((x + y) // 22) % 2).astype(np.float64)
    lum = (1 + mott * 0.08 + brush) * (1 - scr * 0.25) * (0.75 + 0.25 * bev)
    col = tint(rgb((104, 116, 120)), lum)
    hz = np.where(stripe[..., None] > 0, rgb((214, 170, 30))[None, None, :], rgb((26, 24, 22))[None, None, :]) * lum[..., None]
    col = col * (1 - hazard[..., None]) + hz * hazard[..., None]
    col = col * (1 - kick[..., None] * 0.15)
    col = col * (1 - rust[..., None]) + rust[..., None] * tint(rgb((112, 62, 34)), lum)
    save('door_metal.jpg', col)
    save('door_metal_n.jpg', normal_from_height(bev * 2 - scr * 0.6 + kick * 0.0 + mott * 0.5, 1.5))
    save('door_metal_r.jpg', 0.45 + rust * 0.45 + scr * 0.15 + mott * 0.05)


def skin():
    S = 512  # detalhe de pele (multiplica a cor de vértice)
    rng = np.random.default_rng(151)
    f1, f2, _ = worley(S, S, 90, rng)
    pores = smooth(0.12, 0.0, f1)
    wr = np.abs(fbm(S, S, 8, 8, rng, 4))
    wrinkle = smooth(0.05, 0.0, wr)
    vein = smooth(0.03, 0.0, np.abs(fbm(S, S, 4, 4, rng, 3)))
    blot = fbm(S, S, 5, 5, rng, 4)
    lum = 1 + blot * 0.12 - pores * 0.08 - wrinkle * 0.1
    col = np.stack([lum * (1 - vein * 0.06), lum * (1 - vein * 0.1), lum * (1 + vein * 0.02)], -1) * 0.92
    save('skin.jpg', col)
    save('skin_n.jpg', normal_from_height(-pores * 0.6 - wrinkle * 1.2 + blot * 0.5 + f2 * 0.4, 2.0))


def stains():
    """Atlas 4x4 de manchas (RGBA): água, umidade, escorridos, mofo."""
    C, N = 256, 4
    S = C * N
    rng = np.random.default_rng(161)
    out = np.zeros((S, S, 4))
    yy, xx = np.mgrid[0:C, 0:C] / C - 0.5
    for i in range(N * N):
        kind = i // 4  # 0 mancha d'água com borda, 1 umidade, 2 escorrido, 3 mofo/sujeira
        warp = perlin(C, C, 4, 4, rng) * 0.12 + perlin(C, C, 8, 8, rng) * 0.05
        r = np.sqrt(xx ** 2 + yy ** 2) + warp
        n = fbm(C, C, 8, 8, rng, 4)
        if kind == 0:
            body = smooth(0.42, 0.25, r)
            rim = np.exp(-((r - 0.34) ** 2) / 0.0012) * 0.8
            a = body * 0.35 * (0.7 + 0.3 * n) + rim
            c = rgb((116, 86, 38))
        elif kind == 1:
            a = smooth(0.45, 0.05, r) * (0.55 + 0.45 * smooth(-0.2, 0.3, n))
            c = rgb((70, 56, 30))
        elif kind == 2:
            colx = np.zeros(C)
            for _ in range(rng.integers(3, 7)):
                cx = rng.integers(30, C - 30)
                wdt = rng.uniform(3, 10)
                colx += np.exp(-((np.arange(C) - cx) ** 2) / (2 * wdt * wdt))
            lng = smooth(0.5, -0.45, yy + perlin(C, C, 2, 6, rng) * 0.15)
            a = np.clip(colx[None, :] * 0.7, 0, 1) * lng * smooth(-0.5, -0.4, yy) + smooth(0.5, 0.0, np.sqrt(xx ** 2 * 0.6 + (yy + 0.42) ** 2 * 6)) * 0.4
            c = rgb((92, 70, 34))
        else:
            spots = smooth(0.25, 0.6, n) * smooth(0.48, 0.2, r)
            a = spots * 0.85 + smooth(0.45, 0.1, r) * 0.15
            c = rgb((48, 52, 34))
        a = np.clip(a, 0, 1)
        oy, ox = (i // N) * C, (i % N) * C
        out[oy:oy + C, ox:ox + C, :3] = c[None, None, :] * (0.85 + 0.15 * n[..., None])
        out[oy:oy + C, ox:ox + C, 3] = a
    save('stains.png', out)


def noise():
    S = 256
    rng = np.random.default_rng(171)
    ch = [fbm(S, S, 4, 4, rng, 5) * 0.5 + 0.5 for _ in range(4)]
    save('noise.png', np.stack(ch, -1))


JOBS = [
    ('l0_wall', l0_wall), ('l0_carpet', l0_carpet), ('ceiling', l0_ceiling), ('panel', panel),
    ('l1_floor', l1_floor), ('l1_wall', l1_wall), ('l1_ceiling', l1_ceiling), ('wood', wood), ('cardboard', cardboard),
    ('fun_carpet', fun_carpet), ('fun_wall', fun_wall), ('drawings', drawings), ('fun_exit', fun_exit), ('cloth', cloth),
    ('door_metal', metal_door), ('skin', skin), ('stains', stains), ('noise', noise),
]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in JOBS:
        if want(name):
            print(name)
            fn()
