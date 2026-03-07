#!/usr/bin/env python3
"""Generate terminal demo video for OpenBrowser.

Single terminal, full frame. ASCII art banner inside terminal, then AI
browsing Amazon and Uber with explicit Playwright commands.

Usage: python3 create_demo_video.py
Output: ./openbrowser-demo.mp4
"""

import os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Dimensions & Timing ──────────────────────────────────────────
W, H = 1080, 1080
FPS = 30

# ── Colors ────────────────────────────────────────────────────────
BG      = (10, 10, 15)
WHITE   = (232, 232, 232)
LIGHT   = (208, 208, 208)
DIM     = (120, 120, 120)
FAINT   = (50, 50, 55)
GREEN   = (34, 197, 94)
GREEN_L = (130, 230, 130)
BLUE    = (100, 160, 255)
ACTION  = (160, 148, 100)         # warm gold for action keywords (visible but not loud)
PROMPT  = (130, 230, 130)
AI_PROMPT = (120, 170, 255)      # soft blue for AI query prompt
CURSOR  = (232, 232, 232)

# Brand colors
AMAZON   = (255, 153, 0)
UBER     = (130, 200, 255)
GMAIL    = (234, 67, 53)
GITHUB   = (175, 180, 195)
GCAL     = (66, 133, 244)
LINKEDIN = (0, 160, 220)

# ── Fonts ─────────────────────────────────────────────────────────
FDIR   = os.path.expanduser("~/linkedin-posts/engine/carousel/fonts")
mono   = ImageFont.truetype(f"{FDIR}/JetBrainsMono-Regular.ttf", 26)
mono_b = ImageFont.truetype(f"{FDIR}/JetBrainsMono-Bold.ttf", 26)
mono_sm_b = ImageFont.truetype(f"{FDIR}/JetBrainsMono-Bold.ttf", 28)
sans   = ImageFont.truetype(f"{FDIR}/Inter-Bold.ttf", 15)

# ── Terminal Window Geometry ──────────────────────────────────────
MARGIN  = 36
WIN_W   = W - 2 * MARGIN
WIN_H   = 840
WIN_X   = MARGIN
WIN_Y   = 80
WIN_R   = 16
CHR_H   = 44
PAD     = 28
CX      = WIN_X + PAD
CY      = WIN_Y + CHR_H + PAD + 24
LH      = 42

# ── ASCII Art Banner ─────────────────────────────────────────────
ASCII_BANNER = [
    r"  ___                 ___                            ",
    r" / _ \ _ __  ___ _ _ | _ )_ _ _____ __ _____ ___ _ _ ",
    r"| (_) | '_ \/ -_) ' \| _ \ '_/ _ \ V  V (_-</ -_) '_|",
    r" \___/| .__/\___|_||_|___/_| \___/\_/\_//__/\___|_|  ",
    r"      |_|                                            ",
]
ASCII_LH = 34  # line height for ASCII art


# ── Event System ──────────────────────────────────────────────────
class Event:
    def __init__(self, time, kind, data=None):
        self.time = time
        self.kind = kind
        self.data = data


def build_events():
    events = []
    t = 0.0

    # ── Scene 0: Brand intro ────────────────────────────────────
    events.append(Event(t, "v_offset", 80))
    for line in ASCII_BANNER:
        events.append(Event(t, "output_ascii", line))
    events.append(Event(t, "output", [("", WHITE)]))
    events.append(Event(t, "output_hl", ("green", [
        ("  Give AI your browser.", GREEN_L),
    ])))

    t += 1.5
    events.append(Event(t, "clear"))
    t += 0.05

    # ── Scene 1: Amazon order (AI prompt) ───────────────────────
    events.append(Event(t, "v_offset", 40))
    events.append(Event(t, "set_prompt", ("> ", AI_PROMPT)))
    events.append(Event(t, "show_prompt"))
    t += 0.10

    cmd = "Where's my Amazon order?"
    for ch in cmd:
        events.append(Event(t, "type_char", ch))
        t += 0.025
    t += 0.12
    events.append(Event(t, "enter"))
    t += 0.3

    # Action log (fast, visible)
    events.append(Event(t, "output", [("", WHITE)])); t += 0.05
    events.append(Event(t, "output", [
        ("  navigate  ", ACTION), ("\u25cf ", AMAZON), ("amazon.com/your-orders", DIM),
    ])); t += 0.15
    events.append(Event(t, "output", [
        ("  wait      ", ACTION), ("page loaded", FAINT),
    ])); t += 0.12
    events.append(Event(t, "output", [
        ("  extract   ", ACTION), ("latest order", FAINT),
    ])); t += 0.12

    # Results (slow, bright)
    events.append(Event(t, "output", [("", WHITE)])); t += 0.10
    events.append(Event(t, "output_hl", ("green", [
        ("  Sony WH-1000XM5 Headphones", WHITE),
    ]))); t += 0.30
    events.append(Event(t, "output", [("", WHITE)])); t += 0.05
    events.append(Event(t, "output", [
        ("  ordered     ", DIM), ("Mar 4", LIGHT),
    ])); t += 0.18
    events.append(Event(t, "output", [
        ("  status      ", DIM), ("Out for delivery", GREEN_L),
    ])); t += 0.22
    events.append(Event(t, "output", [
        ("  arriving    ", DIM), ("Today by 8pm", GREEN_L),
    ])); t += 0.22

    t += 1.6
    events.append(Event(t, "clear"))
    t += 0.05

    # ── Scene 2: Uber receipts (AI prompt) ──────────────────────
    events.append(Event(t, "v_offset", 10))
    events.append(Event(t, "set_prompt", ("> ", AI_PROMPT)))
    events.append(Event(t, "show_prompt"))
    t += 0.10

    cmd = "Download my Uber receipts from March"
    for ch in cmd:
        events.append(Event(t, "type_char", ch))
        t += 0.022
    t += 0.12
    events.append(Event(t, "enter"))
    t += 0.3

    # Action log (fast)
    events.append(Event(t, "output", [("", WHITE)])); t += 0.05
    events.append(Event(t, "output", [
        ("  navigate  ", ACTION), ("\u25cf ", UBER), ("riders.uber.com/trips", DIM),
    ])); t += 0.15
    events.append(Event(t, "output", [
        ("  wait      ", ACTION), ("trip history loaded", FAINT),
    ])); t += 0.12
    events.append(Event(t, "output", [
        ("  filter    ", ACTION), ("March 2026", FAINT),
    ])); t += 0.12
    events.append(Event(t, "output", [
        ("  found     ", ACTION), ("3 trips", FAINT),
    ])); t += 0.12

    # Downloads (each click+save pair)
    events.append(Event(t, "output", [("", WHITE)])); t += 0.08
    events.append(Event(t, "output", [
        ("  click     ", ACTION), ("Download receipt, Mar 2", DIM),
    ])); t += 0.18
    events.append(Event(t, "output_hl", ("green", [
        ("  \u2713 saved   ", GREEN_L), ("uber-mar02.pdf", WHITE), ("   $14.20", DIM),
    ]))); t += 0.35

    events.append(Event(t, "output", [
        ("  click     ", ACTION), ("Download receipt, Mar 12", DIM),
    ])); t += 0.18
    events.append(Event(t, "output_hl", ("green", [
        ("  \u2713 saved   ", GREEN_L), ("uber-mar12.pdf", WHITE), ("   $22.50", DIM),
    ]))); t += 0.35

    events.append(Event(t, "output", [
        ("  click     ", ACTION), ("Download receipt, Mar 23", DIM),
    ])); t += 0.18
    events.append(Event(t, "output_hl", ("green", [
        ("  \u2713 saved   ", GREEN_L), ("uber-mar23.pdf", WHITE), ("   $18.80", DIM),
    ]))); t += 0.35

    # Summary
    events.append(Event(t, "output", [("", WHITE)])); t += 0.06
    events.append(Event(t, "output", [
        ("  3 receipts saved to ~/Downloads", GREEN_L),
    ])); t += 0.18

    t += 1.1
    events.append(Event(t, "clear"))
    t += 0.05

    # ── End card: ASCII banner + service grid + install ─────────
    events.append(Event(t, "set_prompt", ("$ ", PROMPT)))
    events.append(Event(t, "v_offset", 85))
    for line in ASCII_BANNER:
        events.append(Event(t, "output_ascii", line)); t += 0.04
    t += 0.10
    events.append(Event(t, "output", [("", WHITE)])); t += 0.04
    events.append(Event(t, "output_hl", ("green", [
        ("  Give AI your browser.", GREEN_L),
    ]))); t += 0.20

    # Service grid - two rows of three
    events.append(Event(t, "output", [("", WHITE)])); t += 0.06
    events.append(Event(t, "output", [
        ("  \u25cf", AMAZON), (" Amazon    ", LIGHT),
        ("\u25cf", GMAIL), (" Gmail     ", LIGHT),
        ("\u25cf", GITHUB), (" GitHub", LIGHT),
    ])); t += 0.15
    events.append(Event(t, "output", [
        ("  \u25cf", UBER), (" Uber      ", LIGHT),
        ("\u25cf", GCAL), (" Calendar  ", LIGHT),
        ("\u25cf", LINKEDIN), (" LinkedIn", LIGHT),
    ])); t += 0.15

    events.append(Event(t, "output", [("", WHITE)])); t += 0.06
    events.append(Event(t, "output", [
        ("  ...and any site you're logged into.", DIM),
    ])); t += 0.15
    events.append(Event(t, "output", [("", WHITE)])); t += 0.10
    events.append(Event(t, "show_prompt"))
    t += 0.08
    cmd = "npx openbrowser setup"
    for ch in cmd:
        events.append(Event(t, "type_char", ch))
        t += 0.030
    # Hold with blinking cursor on the install command
    t += 2.2

    total_duration = t + 0.3
    events.sort(key=lambda e: e.time)
    return events, total_duration


# ── State ─────────────────────────────────────────────────────────
class State:
    def __init__(self):
        self.prompt_visible = False
        self.typed = ""
        self.command_committed = False
        self.committed_command = ""
        self.output_lines = []
        self.output_done = False
        self.prompt_char = "$ "
        self.prompt_color = PROMPT
        self.last_typed_at = 0.0
        self.v_offset = 0  # extra vertical offset for centering


# ── Renderer ──────────────────────────────────────────────────────
def draw_window(img):
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [WIN_X, WIN_Y + 4, WIN_X + WIN_W, WIN_Y + WIN_H + 4],
        radius=WIN_R, fill=(0, 0, 0, 50),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    img = Image.alpha_composite(img, shadow)

    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle(
        [WIN_X, WIN_Y, WIN_X + WIN_W, WIN_Y + WIN_H],
        radius=WIN_R, fill=(255, 255, 255, 28),
    )
    cd.rounded_rectangle(
        [WIN_X, WIN_Y, WIN_X + WIN_W, WIN_Y + WIN_H],
        radius=WIN_R, outline=(255, 255, 255, 35), width=1,
    )
    cd.line(
        [(WIN_X + WIN_R, WIN_Y + 1), (WIN_X + WIN_W - WIN_R, WIN_Y + 1)],
        fill=(255, 255, 255, 55), width=1,
    )
    img = Image.alpha_composite(img, card)

    chrome = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    chd = ImageDraw.Draw(chrome)
    chd.rounded_rectangle(
        [WIN_X + 1, WIN_Y + 1, WIN_X + WIN_W - 1, WIN_Y + CHR_H],
        radius=WIN_R - 1, fill=(0, 0, 0, 22),
    )
    chd.rectangle(
        [WIN_X + 1, WIN_Y + CHR_H - WIN_R, WIN_X + WIN_W - 1, WIN_Y + CHR_H],
        fill=(0, 0, 0, 22),
    )
    chd.line(
        [(WIN_X, WIN_Y + CHR_H), (WIN_X + WIN_W, WIN_Y + CHR_H)],
        fill=(255, 255, 255, 10), width=1,
    )
    img = Image.alpha_composite(img, chrome)

    draw = ImageDraw.Draw(img)
    for i, color in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        cx = WIN_X + 24 + i * 24
        cy = WIN_Y + CHR_H // 2
        draw.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=color)
    draw.text(
        (WIN_X + WIN_W // 2, WIN_Y + CHR_H // 2),
        "openbrowser", fill=DIM, font=sans, anchor="mm",
    )
    return img


def draw_segments(draw, x, y, segments, bold=False):
    for text, color in segments:
        is_bold = bold or color in (GREEN_L, PROMPT)
        f = mono_b if is_bold else mono
        draw.text((x, y), text, fill=color, font=f)
        x += draw.textlength(text, font=f)
    return x


def draw_hl_pill(img, y, color_name, t, appear_t):
    fill_c = (34, 197, 94)
    fill_a, outline_a, glow_a_max = 18, 50, 25
    r, g, b = fill_c
    elapsed = t - appear_t
    glow_factor = max(0.0, 1.0 - elapsed / 0.4) if elapsed < 0.4 else 0.0

    x1 = CX - 8
    x2 = WIN_X + WIN_W - PAD + 8
    y1 = y - 5
    y2 = y + LH - 5

    if glow_factor > 0:
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        ga = int(glow_a_max * glow_factor)
        gd.rounded_rectangle(
            [x1 - 6, y1 - 6, x2 + 6, y2 + 6], radius=10, fill=(r, g, b, ga),
        )
        glow = glow.filter(ImageFilter.GaussianBlur(10))
        img = Image.alpha_composite(img, glow)

    pill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    fa = fill_a + int(12 * glow_factor)
    oa = outline_a + int(30 * glow_factor)
    pd.rounded_rectangle(
        [x1, y1, x2, y2], radius=6,
        fill=(r, g, b, fa), outline=(r, g, b, oa), width=1,
    )
    img = Image.alpha_composite(img, pill)
    return img


def _make_orb(color, anchor_x, anchor_y, alpha_range=(0.15, 0.28), blur_range=(120, 180)):
    import random as _rnd
    r, g, b = color
    alpha = int(255 * _rnd.uniform(*alpha_range))
    blur_r = _rnd.randint(*blur_range)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    jx = _rnd.randint(-int(W * 0.15), int(W * 0.15))
    jy = _rnd.randint(-int(H * 0.1), int(H * 0.1))
    cx = int(anchor_x * W) + jx
    cy = int(anchor_y * H) + jy
    rx = _rnd.randint(int(W * 0.3), int(W * 0.55))
    ry = _rnd.randint(int(H * 0.2), int(H * 0.4))
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(r, g, b, alpha))
    return layer.filter(ImageFilter.GaussianBlur(blur_r))


def _make_vignette(strength=100):
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    mx, my = int(W * 0.15), int(H * 0.1)
    d.ellipse([mx, my, W - mx, H - my], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(W // 4))
    vig = Image.new("RGBA", (W, H), (0, 0, 0, strength))
    vig.putalpha(Image.eval(mask, lambda x: max(0, strength - int(x * strength // 255))))
    return vig


def _make_grain(intensity=12, density=0.4):
    import numpy as np
    rng = np.random.default_rng(42)
    noise = rng.integers(-intensity, intensity + 1, size=(H, W), dtype=np.int16)
    m = rng.random(size=(H, W)) < density
    noise = noise * m
    arr = np.full((H, W, 4), 0, dtype=np.uint8)
    pos = noise > 0
    neg = noise < 0
    arr[pos, 0] = arr[pos, 1] = arr[pos, 2] = 255
    arr[pos, 3] = np.clip(noise[pos], 0, 255).astype(np.uint8)
    arr[neg, 3] = np.clip(-noise[neg], 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


_bg_cache = None

def get_static_bg():
    global _bg_cache
    if _bg_cache is not None:
        return _bg_cache.copy()

    import random
    random.seed(7)
    img = Image.new("RGBA", (W, H), (*BG, 255))
    grn = (30, 110, 55)
    teal = (18, 70, 95)
    for color, ax, ay, ar in [
        (grn, 0.0, 0.0, (0.20, 0.30)),
        (teal, 1.0, 1.0, (0.15, 0.25)),
        (grn, 0.6, 0.0, (0.08, 0.14)),
    ]:
        img = Image.alpha_composite(img, _make_orb(color, ax, ay, alpha_range=ar))
    img = Image.alpha_composite(img, _make_vignette())
    img = Image.alpha_composite(img, _make_grain())
    img = draw_window(img)

    draw = ImageDraw.Draw(img)
    draw.text(
        (WIN_X + WIN_W - 16, WIN_Y + WIN_H - 14),
        "@federicodeponte", fill=(55, 58, 68), font=sans, anchor="rm",
    )

    _bg_cache = img
    return _bg_cache.copy()


def render_frame(state, t):
    img = get_static_bg()
    y = CY + state.v_offset
    cursor_blink = int(t * 1.875) % 2 == 0

    if state.command_committed:
        draw = ImageDraw.Draw(img)
        x = CX
        draw.text((x, y), state.prompt_char, fill=state.prompt_color, font=mono_b)
        x += draw.textlength(state.prompt_char, font=mono_b)
        draw.text((x, y), state.committed_command, fill=WHITE, font=mono_b)
        y += LH + 8

    for segments, bold, hl_color, appear_t, is_ascii in state.output_lines:
        if is_ascii:
            draw = ImageDraw.Draw(img)
            draw.text((CX, y), segments, fill=GREEN, font=mono_sm_b)
            y += ASCII_LH
        else:
            if hl_color:
                img = draw_hl_pill(img, y, hl_color, t, appear_t)
            draw = ImageDraw.Draw(img)
            draw_segments(draw, CX, y, segments, bold)
            y += LH

    draw = ImageDraw.Draw(img)

    if state.prompt_visible and not state.command_committed:
        x = CX
        draw.text((x, y), state.prompt_char, fill=state.prompt_color, font=mono_b)
        x += draw.textlength(state.prompt_char, font=mono_b)
        draw.text((x, y), state.typed, fill=WHITE, font=mono)
        x += draw.textlength(state.typed, font=mono)
        # Blink cursor when idle (>0.5s since last keystroke), solid while typing
        idle = (t - state.last_typed_at) > 0.5 if state.last_typed_at > 0 else True
        show_cursor = cursor_blink if idle else True
        if (len(state.typed) > 0 or cursor_blink) and show_cursor:
            draw.rectangle([x, y + 2, x + 12, y + LH - 6], fill=CURSOR)

    return img.convert("RGB")


# ── Main ─────────────────────────────────────────────────────────
def main():
    events, duration = build_events()
    total_frames = int(duration * FPS)
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "openbrowser-demo.mp4")

    print(f"Rendering {total_frames} frames ({duration:.1f}s @ {FPS}fps)...")

    proc = subprocess.Popen(
        [
            "ffmpeg", "-y",
            "-f", "rawvideo", "-vcodec", "rawvideo",
            "-s", f"{W}x{H}", "-pix_fmt", "rgb24",
            "-r", str(FPS),
            "-i", "-",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-crf", "18", "-preset", "medium",
            "-movflags", "+faststart",
            output_path,
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    state = State()
    event_idx = 0

    for frame_num in range(total_frames):
        t = frame_num / FPS

        while event_idx < len(events) and events[event_idx].time <= t:
            e = events[event_idx]
            if e.kind == "show_prompt":
                state.prompt_visible = True
            elif e.kind == "type_char":
                state.typed += e.data
                state.last_typed_at = e.time
            elif e.kind == "enter":
                state.command_committed = True
                state.committed_command = state.typed
                state.typed = ""
            elif e.kind == "output":
                state.output_lines.append((e.data, False, None, e.time, False))
            elif e.kind == "output_ascii":
                state.output_lines.append((e.data, False, None, e.time, True))
            elif e.kind == "output_b":
                state.output_lines.append((e.data, True, None, e.time, False))
            elif e.kind == "output_hl":
                color, segments = e.data
                state.output_lines.append((segments, False, color, e.time, False))
            elif e.kind == "set_prompt":
                state.prompt_char, state.prompt_color = e.data
            elif e.kind == "v_offset":
                state.v_offset = e.data
            elif e.kind == "clear":
                state.prompt_visible = False
                state.typed = ""
                state.command_committed = False
                state.committed_command = ""
                state.output_lines = []
                state.output_done = False
                state.v_offset = 0
            elif e.kind == "done":
                state.output_done = True
            event_idx += 1

        img = render_frame(state, t)
        proc.stdin.write(img.tobytes())

        if frame_num % 90 == 0:
            pct = int(frame_num / total_frames * 100)
            print(f"  {pct}%")

    proc.stdin.close()
    proc.wait()

    print(f"\nDone! {output_path}")
    print(f"Duration: {duration:.1f}s | Size: {os.path.getsize(output_path) / 1024:.0f}KB")


if __name__ == "__main__":
    main()
