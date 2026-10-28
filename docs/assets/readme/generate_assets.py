#!/usr/bin/env python3
"""Generate PixeCreator README artwork from committed sprite sheets.

Docs-only tool (Python + Pillow); not part of the asset pipeline and not a
runtime dependency. All pixels come from sheets/*.png built by tools/sheet.mjs,
so the homepage art stays reproducible from the repo itself.

Usage: python docs/assets/readme/generate_assets.py
"""
import os
from collections import deque

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SHEETS = os.path.join(ROOT, "sheets")
OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)

BG = "#14161a"
BG2 = "#171a20"
PANEL = "#1b1e24"
BORDER = "#2a2f38"
TEXT = "#eef2f6"
DIM = "#9aa4b2"
ACCENT = "#6ac8e8"
RED = "#c03028"

W, H = 1200, 320


def f_latin(size):
    for path in (r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def f_cjk(size):
    for path in (
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\Deng.ttf",
        r"C:\Windows\Fonts\simsun.ttc",
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return f_latin(size)


def checker(size, cell=24):
    img = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(img)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2 == 0:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=BG2)
    return img


def matte_white(img, threshold=236):
    """Display-only matting: clear border-connected near-white pixels.

    guardian_001 sources are baked on white (GIF origin); interior whites stay
    because only the border-connected region is cleared.
    """
    img = img.copy()
    px = img.load()
    w, h = img.size
    seen = [[False] * w for _ in range(h)]
    queue = deque()

    def near_white(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and r >= threshold and g >= threshold and b >= threshold

    for x in range(w):
        for y in (0, h - 1):
            if near_white(x, y) and not seen[y][x]:
                seen[y][x] = True
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_white(x, y) and not seen[y][x]:
                seen[y][x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and near_white(nx, ny):
                seen[ny][nx] = True
                queue.append((nx, ny))
    # second pass: drop near-white fringes touching transparency (1px halo)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or min(r, g, b) < 228:
                continue
            if (
                (x > 0 and px[x - 1, y][3] == 0)
                or (x + 1 < w and px[x + 1, y][3] == 0)
                or (y > 0 and px[x, y - 1][3] == 0)
                or (y + 1 < h and px[x, y + 1][3] == 0)
            ):
                px[x, y] = (0, 0, 0, 0)
    return img


def frame(name, cell, col=0, row=0):
    img = Image.open(os.path.join(SHEETS, name)).convert("RGBA")
    return img.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))


def up(img, scale):
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


def letterspace(draw, xy, text, font, fill, spacing=3):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing


def corner_marks(draw, w, h, color, inset=10, size=10):
    for x, y, dx, dy in (
        (inset, inset, 1, 1),
        (w - inset, inset, -1, 1),
        (inset, h - inset, 1, -1),
        (w - inset, h - inset, -1, -1),
    ):
        draw.line([(x, y), (x + dx * size, y)], fill=color, width=2)
        draw.line([(x, y), (x, y + dy * size)], fill=color, width=2)


def hero_frames():
    eyebrow_font = f_latin(14)
    title_font = f_latin(62)
    sub_font = f_cjk(21)
    frames = []
    for i in range(3):
        img = checker((W, H))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W - 1, H - 1], outline=BORDER)
        d.rectangle([0, 0, W // 2 - 1, 3], fill=RED)
        d.rectangle([W // 2, 0, W - 1, 3], fill=ACCENT)
        corner_marks(d, W, H, BORDER, inset=16, size=12)

        d.rectangle([56, 47, 64, 55], fill=ACCENT)
        letterspace(d, (76, 44), "PIXEL ASSET PIPELINE", eyebrow_font, ACCENT, spacing=3)
        d.text((54, 68), "PixeCreator", font=title_font, fill=TEXT)
        d.text((57, 148), "文本 & 原型图  →  像素资产  →  拼表  →  Godot 4", font=sub_font, fill=DIM)

        knight = up(frame("knight_td_walk.png", 64, i, 0), 2)
        guardian = up(matte_white(frame("guardian_td_walk.png", 64, i, 0)), 2)
        img.paste(knight, (56, 184), knight)
        img.paste(guardian, (480, 184), guardian)

        info_x = 900
        for row, (mark, text) in enumerate(
            (("182", "tests passing"), ("30", "sheets · 22 Full + 8 Maker"), ("24", "Godot animations per character"))
        ):
            y = 196 + row * 30
            d.rectangle([info_x, y + 2, info_x + 6, y + 8], fill=ACCENT)
            d.text((info_x + 16, y - 3), mark, font=f_cjk(17), fill=TEXT)
            d.text((info_x + 62, y), text, font=f_cjk(13), fill=DIM)

        frames.append(img)
    return frames


def panel(draw, box, title, sub, sheet_name, cell, row, strip_cols, caption):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle([x0, y0, x1, y1], radius=12, fill=PANEL, outline=BORDER)
    draw.text((x0 + 22, y0 + 18), title, font=f_latin(20), fill=TEXT)
    draw.text((x0 + 22, y0 + 46), sub, font=f_cjk(13), fill=DIM)
    strip = Image.open(os.path.join(SHEETS, sheet_name)).convert("RGBA")
    crop = strip.crop((0, row * cell, strip_cols * cell, (row + 1) * cell))
    if sheet_name.startswith("guardian"):
        crop = matte_white(crop)
    scale = min(2, (x1 - x0 - 44) // crop.width)
    scale = max(1, scale)
    big = up(crop, scale)
    img = draw._image
    px = x0 + (x1 - x0 - big.width) // 2
    img.paste(big, (px, y0 + 96), big)
    draw.text((x0 + 22, y1 - 34), caption, font=f_cjk(12), fill=DIM)


def showcase_characters():
    img = checker((1200, 420))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 1199, 419], outline=BORDER)
    d.rectangle([0, 0, 1199, 3], fill=ACCENT)
    d.text((48, 34), "CHARACTERS", font=f_latin(26), fill=TEXT)
    d.text((48, 68), "角色资产 · 24 动画 · td/sd 双视角 · 每格 64px", font=f_cjk(14), fill=DIM)
    panel(
        d, (48, 104, 588, 386), "knight_001",
        "synth · 64 views · walk / fr / td", "knight_td_walk.png", 64, 0, 3,
        "3 帧行走循环 · 由 asset.json 生成",
    )
    panel(
        d, (612, 104, 1152, 386), "guardian_001",
        "imported + AI in-betweens · 56 views · walk / fr / td", "guardian_td_walk.png", 64, 0, 3,
        "3 帧行走循环 · 真实素材导入",
    )
    return img


def showcase_statics():
    img = checker((1200, 360))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 1199, 359], outline=BORDER)
    d.rectangle([0, 0, 1199, 3], fill=RED)
    d.text((48, 30), "STATIC PROPS", font=f_latin(26), fill=TEXT)
    d.text((48, 64), "静态资产 · 5 类 · idle-only · 64/128 双档", font=f_cjk(14), fill=DIM)

    cards = [
        ("house_001", "building · 128", "house_td_idle.png", 128),
        ("tree_001", "scenery · 128", "tree_td_idle.png", 128),
        ("sword_001", "weapon · 64", "sword_td_idle.png", 64),
        ("potion_001", "prop · 64", "potion_td_idle.png", 64),
        ("crate_001", "prop · 64", "crate_td_idle.png", 64),
    ]
    x = 50
    for name, meta, sheet, cell in cards:
        d.rounded_rectangle([x, 100, x + 196, 320], radius=12, fill=PANEL, outline=BORDER)
        sprite = frame(sheet, cell)
        scale = 128 // cell
        big = up(sprite, scale)
        img.paste(big, (x + (196 - big.width) // 2, 100 + (170 - big.height) // 2 + 20), big)
        d.text((x + 16, 282), name, font=f_latin(15), fill=TEXT)
        d.text((x + 16, 302), meta, font=f_cjk(11), fill=DIM)
        x += 220
    return img


def save_gif(frames, path, duration=240):
    base = frames[0].quantize(colors=64, method=Image.MEDIANCUT)
    quantized = [f.quantize(palette=base) for f in frames]
    quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=duration, loop=0, optimize=True)


def main():
    frames = hero_frames()
    frames[0].save(os.path.join(OUT, "hero.png"), optimize=True)
    save_gif(frames, os.path.join(OUT, "hero.gif"))
    showcase_characters().save(os.path.join(OUT, "showcase-characters.png"), optimize=True)
    showcase_statics().save(os.path.join(OUT, "showcase-statics.png"), optimize=True)
    for name in ("hero.png", "hero.gif", "showcase-characters.png", "showcase-statics.png"):
        path = os.path.join(OUT, name)
        print(f"{name}: {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
