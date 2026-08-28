#!/usr/bin/env python3
"""Generate 代码编辑器 app icon — macOS 26 Liquid Glass.

Design principle: LUMINOUS base + dark frosted card = strong contrast.
Background is a vivid, saturated gradient (not dark or muddy).
Glass card is dark but translucent with rich specular highlights.
Only 3 code lines — clean and iconic.
"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def rrect_mask(size, r):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0]-1, size[1]-1), radius=r, fill=255)
    return m


def make_icon(size):
    sc = 4 if size <= 128 else 2 if size <= 512 else 1
    s = size * sc
    bgr = int(s * 0.225)
    bgm = rrect_mask((s, s), bgr)

    # ============================================================
    # 1. BACKGROUND — vivid, saturated, luminous
    # Coral-peach top → magenta-pink middle → deep violet bottom
    # ============================================================
    grad = Image.new("RGB", (s, s))
    d = ImageDraw.Draw(grad)
    c_top = (255, 160, 120)    # warm coral
    c_mid = (220, 90, 160)     # magenta pink
    c_bot = (100, 60, 180)     # rich violet
    for y in range(s):
        t = y / max(1, s - 1)
        c = lerp(c_top, c_mid, t / 0.5) if t < 0.5 else lerp(c_mid, c_bot, (t - 0.5) / 0.5)
        d.line([(0, y), (s, y)], fill=c)

    base = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    base.paste(grad, (0, 0), bgm)

    # Bright specular sheen — top area
    sh = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for y in range(int(s * 0.35)):
        t = y / (s * 0.35)
        a = int(110 * (1 - t) ** 2.5)
        sd.line([(0, y), (s, y)], fill=(255, 255, 255, a))
    shc = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    shc.paste(sh, (0, 0), bgm)
    base = Image.alpha_composite(base, shc)

    # Subtle warm light blob upper-right
    blob = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bx, by, br_ = int(s*0.68), int(s*0.18), int(s*0.25)
    ImageDraw.Draw(blob).ellipse((bx-br_, by-br_, bx+br_, by+br_),
                                  fill=(255, 200, 150, 40))
    blob = blob.filter(ImageFilter.GaussianBlur(radius=int(s*0.07)))
    blobc = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    blobc.paste(blob, (0, 0), bgm)
    base = Image.alpha_composite(base, blobc)

    # Inner border: bright top, dark bottom
    lw = max(1, int(s * 0.004))
    for half, color, side in [
        ("top", (255, 255, 255, 60), (0, 0, s, s//2)),
        ("bot", (0, 0, 0, 30), (0, s//2, s, s))
    ]:
        b_ = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(b_).rounded_rectangle(
            (lw, lw, s-1-lw, s-1-lw), radius=bgr-lw,
            outline=color, width=lw)
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rectangle(side, fill=255)
        clipped = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        clipped.paste(b_, (0, 0), mask)
        base = Image.alpha_composite(base, clipped)

    # ============================================================
    # 2. GLASS CARD — dark, frosted, floating
    # ============================================================
    pl, pt = int(s*0.15), int(s*0.20)
    pr, pb = int(s*0.85), int(s*0.83)
    pw, ph = pr - pl, pb - pt
    prad = int(s * 0.065)

    pmask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(pmask).rounded_rectangle((pl, pt, pr, pb), radius=prad, fill=255)

    # Double drop shadow
    for blur, alpha, off in [(int(s*0.04), 45, int(s*0.016)),
                              (int(s*0.012), 75, int(s*0.005))]:
        sd_ = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(sd_).rounded_rectangle(
            (pl+off, pt+off, pr+off, pb+off),
            radius=prad, fill=(0, 0, 0, alpha))
        sd_ = sd_.filter(ImageFilter.GaussianBlur(radius=blur))
        base = Image.alpha_composite(base, sd_)

    # Glass fill — dark but with subtle blue undertone
    gl = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for y in range(pt, pb+1):
        t = (y - pt) / max(1, ph)
        r = int(24 + 6 * (1 - t))
        g = int(26 + 8 * (1 - t))
        b = int(46 + 12 * (1 - t))
        a = int(220 + 25 * t)
        gd.line([(pl, y), (pr, y)], fill=(r, g, b, min(255, a)))
    glc = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    glc.paste(gl, (0, 0), pmask)
    base = Image.alpha_composite(base, glc)

    # Glass top sheen — bright, catches the coral light from above
    gs = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gsd = ImageDraw.Draw(gs)
    gsh = int(ph * 0.14)
    for y in range(gsh):
        t = y / gsh
        a = int(80 * (1 - t) ** 2)
        gsd.line([(pl, pt+y), (pr, pt+y)], fill=(255, 200, 180, a))
    gsc = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gsc.paste(gs, (0, 0), pmask)
    base = Image.alpha_composite(base, gsc)

    # Glass border — warm highlight top, cool highlight overall
    gbw = max(1, int(s * 0.003))
    gb = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(gb).rounded_rectangle(
        (pl, pt, pr, pb), radius=prad,
        outline=(255, 200, 200, 45), width=gbw)
    base = Image.alpha_composite(base, gb)

    # ============================================================
    # 3. TITLEBAR
    # ============================================================
    tbh = int(ph * 0.14)
    tby = pt + tbh

    sep = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(sep).line(
        [(pl + int(pw*0.04), tby), (pr - int(pw*0.04), tby)],
        fill=(255, 255, 255, 16), width=max(1, int(s*0.0015)))
    base = Image.alpha_composite(base, sep)

    dotr = max(2, int(ph * 0.026))
    doty = pt + tbh // 2
    dotx0 = pl + int(pw * 0.065)
    dotgap = int(pw * 0.065)
    dots = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    dd_ = ImageDraw.Draw(dots)
    for i, dc in enumerate([
        (255, 95, 86, 220), (255, 189, 46, 210), (39, 201, 63, 205)
    ]):
        cx = dotx0 + i * dotgap
        dd_.ellipse((cx-dotr, doty-dotr, cx+dotr, doty+dotr), fill=dc)
    base = Image.alpha_composite(base, dots)

    # ============================================================
    # 4. THREE CODE LINES — vivid, well-spaced
    # ============================================================
    ct = tby + int(ph * 0.16)
    cb = pb - int(ph * 0.13)
    ch = cb - ct
    line_sp = ch // 3
    bar_t = max(3, int(s * 0.019))
    bar_r = bar_t // 2
    cl = pl + int(pw * 0.10)
    cw = int(pw * 0.80)
    gap = int(cw * 0.024)

    lines = [
        # purple keyword + cyan function + small grey
        [((195, 140, 255, 245), 0.13), (None, 0.025),
         ((95, 210, 255, 245), 0.26), (None, 0.02),
         ((160, 165, 185, 150), 0.05)],
        # indented: green string + warm orange
        [(None, 0.06),
         ((115, 235, 165, 240), 0.30), (None, 0.025),
         ((255, 180, 90, 230), 0.13)],
        # indented: pink/coral + cyan identifier
        [(None, 0.06),
         ((255, 120, 130, 230), 0.15), (None, 0.025),
         ((95, 210, 255, 225), 0.21)],
    ]

    code = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    cd_ = ImageDraw.Draw(code)
    cursor_x = cl

    for li, row in enumerate(lines):
        y0 = ct + li * line_sp + (line_sp - bar_t) // 2
        x = cl
        for color, wr in row:
            w = int(cw * wr)
            if color is None:
                x += w
                continue
            cd_.rounded_rectangle((x, y0, x+w, y0+bar_t), radius=bar_r, fill=color)
            x += w + gap
        if li == 0:
            cursor_x = x + int(cw * 0.01)

    base = Image.alpha_composite(base, code)

    # ============================================================
    # 5. CURSOR — luminous beam
    # ============================================================
    curh = int(line_sp * 0.55)
    curw = max(2, int(s * 0.007))
    cury = ct + (line_sp - curh) // 2

    # Glow
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    glr = int(s * 0.022)
    ImageDraw.Draw(glow).ellipse(
        (cursor_x-glr, cury+curh//2-glr, cursor_x+glr, cury+curh//2+glr),
        fill=(160, 200, 255, 65))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(s*0.016)))
    base = Image.alpha_composite(base, glow)

    cur = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(cur).rounded_rectangle(
        (cursor_x-curw//2, cury, cursor_x+curw//2, cury+curh),
        radius=max(1, curw//2), fill=(200, 220, 255, 250))
    base = Image.alpha_composite(base, cur)

    # ============================================================
    # 6. OUTER GLOW
    # ============================================================
    og = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(og).rounded_rectangle(
        (0, 0, s-1, s-1), radius=bgr, fill=(255, 120, 160, 12))
    og = og.filter(ImageFilter.GaussianBlur(radius=int(s*0.02)))
    final = Image.alpha_composite(og, base)

    if sc != 1:
        final = final.resize((size, size), Image.LANCZOS)
    return final


def main():
    iconset_dir = os.path.join(OUT, "icon.iconset")
    if os.path.isdir(iconset_dir):
        for f in os.listdir(iconset_dir):
            os.remove(os.path.join(iconset_dir, f))
    else:
        os.makedirs(iconset_dir, exist_ok=True)

    pairs = [
        (16, "icon_16x16.png"), (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"), (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"), (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"), (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"), (1024, "icon_512x512@2x.png"),
    ]
    cache = {}
    for size, name in pairs:
        if size not in cache:
            cache[size] = make_icon(size)
        cache[size].save(os.path.join(iconset_dir, name), "PNG")
        print(f"wrote {name}")
    cache[1024].save(os.path.join(OUT, "icon_1024.png"), "PNG")

    icns = os.path.join(OUT, "icon.icns")
    ret = os.system(f"iconutil -c icns '{iconset_dir}' -o '{icns}'")
    if ret == 0:
        import shutil
        print(f"wrote {icns}")
        for dst in [
            os.path.join(OUT, "..", "dist", "代码编辑器.app", "Contents", "Resources", "AppIcon.icns"),
            "/Applications/代码编辑器.app/Contents/Resources/AppIcon.icns"
        ]:
            if os.path.isdir(os.path.dirname(dst)):
                shutil.copy2(icns, dst)
                print(f"  → {dst}")
        os.system('touch "/Applications/代码编辑器.app" 2>/dev/null')
        os.system('/System/Library/Frameworks/CoreServices.framework/'
                  'Frameworks/LaunchServices.framework/Support/'
                  'lsregister -f "/Applications/代码编辑器.app" 2>/dev/null')
    print("done.")


if __name__ == "__main__":
    main()
