#!/usr/bin/env python3
"""Generate Bureau's AI-agent marketplace social graphics and vertical product ad."""

from __future__ import annotations

import json
import math
import shutil
import struct
import subprocess
import wave
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "marketing" / "bureau-launch"
QA = ROOT / "output" / "marketing" / "bureau-launch"
TMP = ROOT / "tmp" / "social-video"
CATALOG = ROOT / "public" / "storefront"
CAMPAIGN = json.loads((OUT / "campaign.json").read_text())

W = H = 1080
VW, VH = 1080, 1920
INK = "#10110e"
INK_2 = "#1a1b17"
CREAM = "#f4f1e8"
PAPER = "#ebe7dc"
WHITE = "#ffffff"
MUTED = "#6f7169"
LIME = "#d8ff3e"
OLIVE = "#71851f"
LINE = "#d9d5ca"

HELVETICA = "/System/Library/Fonts/HelveticaNeue.ttc"
GEORGIA = "/System/Library/Fonts/Supplemental/Georgia Italic.ttf"


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    indexes = {"regular": 0, "bold": 1, "italic": 2, "medium": 10}
    return ImageFont.truetype(HELVETICA, size=size, index=indexes[weight])


def serif(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(GEORGIA, size=size)


def rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def cover(path: Path, size: tuple[int, int], anchor: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    image = Image.open(path).convert("RGB")
    return ImageOps.fit(image, size, method=Image.Resampling.LANCZOS, centering=anchor)


def paste_rounded(base: Image.Image, image: Image.Image, box: tuple[int, int, int, int], radius: int = 24) -> None:
    x1, y1, x2, y2 = box
    image = ImageOps.fit(image.convert("RGB"), (x2 - x1, y2 - y1), method=Image.Resampling.LANCZOS)
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    base.paste(image, (x1, y1), mask)


def draw_logo(draw: ImageDraw.ImageDraw, x: int, y: int, light: bool = False, scale: float = 1.0) -> None:
    size = round(54 * scale)
    draw.rounded_rectangle((x, y, x + size, y + size), radius=round(8 * scale), fill=LIME)
    bfont = font(round(28 * scale), "bold")
    bbox = draw.textbbox((0, 0), "B", font=bfont)
    draw.text((x + (size - (bbox[2] - bbox[0])) / 2, y + (size - (bbox[3] - bbox[1])) / 2 - bbox[1]), "B", font=bfont, fill=INK)
    draw.text((x + size + round(16 * scale), y + round(10 * scale)), "BUREAU", font=font(round(25 * scale), "bold"), fill=WHITE if light else INK, stroke_width=0)


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> str:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if not current or draw.textbbox((0, 0), candidate, font=face)[2] <= width:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    return "\n".join(lines)


def text_block(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, size: int, width: int,
               fill: str = INK, weight: str = "regular", spacing: int | None = None,
               serif_face: bool = False) -> tuple[int, int, int, int]:
    face = serif(size) if serif_face else font(size, weight)
    copy = wrap(draw, text, face, width)
    draw.multiline_text(xy, copy, font=face, fill=fill, spacing=spacing or round(size * 0.16))
    return draw.multiline_textbbox(xy, copy, font=face, spacing=spacing or round(size * 0.16))


def label(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, fill: str = LIME, ink: str = INK,
          padx: int = 22, pady: int = 12, size: int = 25) -> tuple[int, int, int, int]:
    face = font(size, "bold")
    bbox = draw.textbbox((0, 0), text, font=face)
    width, height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    box = (x, y, x + width + 2 * padx, y + height + 2 * pady)
    draw.rounded_rectangle(box, radius=10, fill=fill)
    draw.text((x + padx, y + pady - bbox[1]), text, font=face, fill=ink)
    return box


def right_arrow(draw: ImageDraw.ImageDraw, x: int, y: int, color: str = INK, size: int = 28, width: int = 3) -> None:
    middle = y + size // 2
    draw.line((x, middle, x + size, middle), fill=color, width=width)
    draw.line((x + size - 9, middle - 9, x + size, middle, x + size - 9, middle + 9), fill=color, width=width, joint="curve")


def footer_url(draw: ImageDraw.ImageDraw, light: bool = False, y: int = 1002) -> None:
    draw.line((60, y - 28, 1020, y - 28), fill="#353630" if light else LINE, width=2)
    draw.text((60, y), "AI.EB28.CO", font=font(24, "bold"), fill=LIME if light else INK)
    draw.text((802, y), "START WITH ONE TASK", font=font(18, "bold"), fill=WHITE if light else MUTED)
    right_arrow(draw, 988, y - 1, WHITE if light else MUTED, size=22, width=2)


def save(image: Image.Image, name: str) -> None:
    image.save(OUT / name, "PNG", optimize=True, compress_level=9)


def render_post_01() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(INK))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54, light=True)
    d.text((60, 170), "HIRE AN", font=font(111, "bold"), fill=WHITE)
    d.text((60, 276), "AI AGENT.", font=font(132, "bold"), fill=LIME)
    d.text((64, 442), "Real business work. Clear price. Accountable delivery.", font=font(29, "regular"), fill="#c9cbc2")
    names = ["research-brief.jpg", "spreadsheet-cleanup.jpg", "website-fix.jpg"]
    labels = ["Research", "Spreadsheets", "Website fixes"]
    for i, (name, title) in enumerate(zip(names, labels)):
        x = 60 + i * 330
        paste_rounded(im, cover(CATALOG / name, (310, 350)), (x, 550, x + 310, 900), 18)
        d.text((x, 921), title, font=font(24, "bold"), fill=WHITE)
    footer_url(d, light=True)
    return im


def render_post_02() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(CREAM))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54)
    text_block(d, (60, 180), "Know the\nmarket.\nMove first.", 88, 440, weight="bold", spacing=2)
    text_block(d, (64, 530), "A current, cited snapshot of one competitor.", 27, 390, fill=MUTED, spacing=4)
    label(d, 60, 604, "$89", size=29)
    d.text((64, 675), "Typical delivery  1 BUSINESS DAY", font=font(20, "bold"), fill=INK)
    photo = cover(CATALOG / "research-brief.jpg", (510, 720), (0.52, 0.5))
    paste_rounded(im, photo, (510, 160, 1020, 880), 24)
    d.rectangle((490, 825, 1000, 900), fill=INK)
    d.text((518, 848), "COMPETITOR SNAPSHOT", font=font(23, "bold"), fill=WHITE)
    footer_url(d)
    return im


def render_post_03() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(INK))
    d = ImageDraw.Draw(im)
    photo = cover(CATALOG / "spreadsheet-cleanup.jpg", (1080, 610), (0.5, 0.4))
    im.paste(photo, (0, 0))
    d.rectangle((0, 0, 1080, 90), fill=INK)
    draw_logo(d, 52, 18, light=True, scale=0.85)
    d.rectangle((0, 610, 1080, 1080), fill=INK)
    d.text((60, 675), "Messy spreadsheet?", font=font(72, "bold"), fill=WHITE)
    d.text((60, 752), "Fixed.", font=font(112, "bold"), fill=LIME)
    d.text((65, 886), "Clean, consistent, and traceable.", font=font(28), fill="#c8cac1")
    label(d, 756, 886, "$49 / 1K ROWS", fill=WHITE, size=23)
    footer_url(d, light=True, y=1015)
    return im


def render_post_04() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(CREAM))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54)
    d.text((60, 155), "Your website issue", font=font(70, "bold"), fill=INK)
    d.text((60, 224), "ends here.", font=serif(79), fill=OLIVE)
    d.text((64, 320), "Diagnosed. Fixed. Tested. Documented.", font=font(27), fill=MUTED)
    d.rounded_rectangle((60, 400, 1020, 875), radius=24, fill=WHITE, outline=LINE, width=3)
    d.rounded_rectangle((60, 400, 1020, 455), radius=24, fill=INK)
    for x, color in zip((92, 120, 148), ("#ff7b67", "#ffd35c", LIME)):
        d.ellipse((x, 419, x + 15, 434), fill=color)
    d.rounded_rectangle((218, 416, 820, 440), radius=12, fill="#33342f")
    photo = cover(CATALOG / "website-fix.jpg", (900, 386), (0.5, 0.48))
    im.paste(photo, (90, 471))
    label(d, 60, 908, "$99 / ONE FIX", size=25)
    d.text((812, 924), "1–2 DAYS", font=font(23, "bold"), fill=INK)
    right_arrow(d, 961, 923, INK, size=24, width=3)
    footer_url(d, y=1018)
    return im


def render_post_05() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(INK))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54, light=True)
    d.text((60, 168), "A clearer way", font=font(75, "bold"), fill=WHITE)
    d.text((60, 242), "to get work done.", font=serif(72), fill=LIME)
    steps = [
        ("01", "SHARE", "Describe or paste the job."),
        ("02", "APPROVE", "See price, timing, and scope."),
        ("03", "RECEIVE", "Review the completed result."),
    ]
    colors = [LIME, CREAM, WHITE]
    for i, ((number, title, body), color) in enumerate(zip(steps, colors)):
        y = 390 + i * 180
        d.rounded_rectangle((60, y, 1020, y + 145), radius=18, fill=color)
        d.text((89, y + 37), number, font=font(27, "bold"), fill=MUTED)
        d.text((190, y + 27), title, font=font(42, "bold"), fill=INK)
        d.text((190, y + 83), body, font=font(24), fill=INK)
        right_arrow(d, 945, y + 54, INK, size=31, width=4)
    footer_url(d, light=True)
    return im


def render_post_06() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(LIME))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54)
    d.text((60, 160), "Common Upwork job?", font=font(70, "bold"), fill=INK)
    d.text((60, 240), "Check our price.", font=serif(82), fill=INK)
    d.text((64, 350), "Published starter packages. No invented comparison.", font=font(25), fill=INK)
    d.rounded_rectangle((60, 420, 1020, 880), radius=28, fill=INK)
    rows = [
        ("SPREADSHEET CLEANUP", "UP TO 1,000 ROWS", "$49"),
        ("SEO CONTENT BRIEF", "ONE TOPIC + SITE", "$59"),
        ("WEBSITE FIX", "ONE REPRODUCIBLE ISSUE", "$99"),
    ]
    for index, (title, scope, price) in enumerate(rows):
        y = 468 + index * 105
        d.text((95, y), title, font=font(23, "bold"), fill=WHITE)
        d.text((95, y + 38), scope, font=font(16, "bold"), fill="#8f9188")
        d.text((830, y), price, font=font(42, "bold"), fill=LIME)
        if index < len(rows) - 1:
            d.line((95, y + 82, 985, y + 82), fill="#34362f", width=2)
    d.rounded_rectangle((95, 790, 985, 844), radius=10, fill=LIME)
    d.text((125, 806), "PASTE YOUR JOB LINK", font=font(20, "bold"), fill=INK)
    right_arrow(d, 928, 805, INK, size=25, width=3)
    d.text((60, 915), "Independent service. Not affiliated with or endorsed by Upwork.", font=font(18), fill=INK)
    d.text((60, 1007), "AI.EB28.CO/BEAT-UPWORK", font=font(22, "bold"), fill=INK)
    return im


def render_post_07() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(INK))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54, light=True)
    d.text((60, 165), "One marketplace.", font=font(76, "bold"), fill=WHITE)
    d.text((60, 240), "Two sides.", font=serif(82), fill=LIME)
    cards = [
        (60, "HIRE WORK", "Customers", "Choose an outcome or compare active agents.", CREAM),
        (550, "FIND WORK", "Agent operators", "Connect an agent to discover jobs and bid.", LIME),
    ]
    for x, kicker, title, body, color in cards:
        d.rounded_rectangle((x, 390, x + 470, 870), radius=22, fill=color)
        d.text((x + 35, 430), kicker, font=font(19, "bold"), fill=MUTED)
        d.text((x + 35, 485), title, font=font(43, "bold"), fill=INK)
        text_block(d, (x + 35, 570), body, 27, 385, fill=INK)
        d.line((x + 35, 742, x + 435, 742), fill="#b9b9b0", width=2)
        d.text((x + 35, 778), "ENTER MARKETPLACE", font=font(20, "bold"), fill=INK)
        right_arrow(d, x + 397, 779, INK, size=25, width=3)
    footer_url(d, light=True)
    return im


def render_post_08() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(CREAM))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54)
    d.text((60, 180), "NO PROMPTS.", font=font(91, "bold"), fill=INK)
    d.text((60, 294), "NO MODELS.", font=font(91, "bold"), fill=INK)
    d.rounded_rectangle((45, 414, 1035, 640), radius=24, fill=LIME)
    d.text((78, 452), "JUST DONE.", font=font(121, "bold"), fill=INK)
    d.text((64, 710), "You don't need to understand AI.", font=font(34, "bold"), fill=INK)
    d.text((64, 758), "Tell Bureau the business result you need.", font=font(28), fill=MUTED)
    d.rounded_rectangle((60, 845, 530, 925), radius=12, fill=INK)
    d.text((94, 869), "TELL US THE TASK", font=font(24, "bold"), fill=WHITE)
    right_arrow(d, 466, 873, WHITE, size=24, width=3)
    footer_url(d)
    return im


def render_post_09() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(CREAM))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54)
    d.text((60, 155), "Price first.", font=font(80, "bold"), fill=INK)
    d.text((60, 235), "Work second.", font=serif(82), fill=OLIVE)
    d.text((64, 335), "Know the cost, timing, and finish line before work starts.", font=font(26), fill=MUTED)
    d.rounded_rectangle((60, 430, 1020, 894), radius=25, fill=WHITE, outline=LINE, width=2)
    paste_rounded(im, cover(CATALOG / "research-brief.jpg", (395, 400)), (92, 462, 487, 862), 18)
    d.text((540, 476), "COMPETITOR SNAPSHOT", font=font(18, "bold"), fill=MUTED)
    d.text((540, 534), "$89", font=font(91, "bold"), fill=INK)
    d.text((540, 638), "1 BUSINESS DAY", font=font(24, "bold"), fill=OLIVE)
    d.line((540, 696, 955, 696), fill=LINE, width=2)
    d.text((540, 728), "1 competitor", font=font(24), fill=INK)
    d.text((540, 769), "Current cited sources", font=font(24), fill=INK)
    label(d, 540, 817, "START", size=20)
    right_arrow(d, 693, 829, INK, size=22, width=3)
    footer_url(d, y=1008)
    return im


def render_post_10() -> Image.Image:
    im = Image.new("RGB", (W, H), rgb(LIME))
    d = ImageDraw.Draw(im)
    draw_logo(d, 60, 54)
    text_block(d, (60, 180), "What do you need done today?", 93, 920, weight="bold", spacing=1)
    d.text((64, 527), "Start with one task.", font=serif(51), fill=INK)
    d.rounded_rectangle((60, 630, 1020, 925), radius=26, fill=INK)
    categories = ["RESEARCH", "SPREADSHEETS", "WEBSITE FIXES", "CONTENT", "SUPPORT", "INVOICE REVIEW"]
    for i, category in enumerate(categories):
        x = 95 + (i % 2) * 440
        y = 675 + (i // 2) * 66
        d.rounded_rectangle((x, y + 8, x + 10, y + 18), radius=2, fill=LIME)
        d.text((x + 26, y), category, font=font(24, "bold"), fill=WHITE)
    d.text((60, 991), "AI.EB28.CO", font=font(35, "bold"), fill=INK)
    d.text((806, 1000), "START NOW", font=font(21, "bold"), fill=INK)
    right_arrow(d, 970, 1001, INK, size=24, width=3)
    return im


POST_RENDERERS = [
    render_post_01, render_post_02, render_post_03, render_post_04, render_post_05,
    render_post_06, render_post_07, render_post_08, render_post_09, render_post_10,
]


def video_slide_01() -> Image.Image:
    im = Image.new("RGB", (VW, VH), rgb(INK))
    d = ImageDraw.Draw(im)
    draw_logo(d, 70, 86, light=True, scale=1.15)
    d.text((70, 320), "HIRE AN", font=font(105, "bold"), fill=WHITE)
    d.text((70, 440), "AI AGENT.", font=font(138, "bold"), fill=LIME)
    d.text((74, 650), "Real business work from $49.", font=font(35), fill="#c9cbc2")
    d.text((74, 710), "Clear scope. Accountable delivery.", font=font(30), fill="#c9cbc2")
    for i, name in enumerate(("research-brief.jpg", "spreadsheet-cleanup.jpg", "website-fix.jpg")):
        x = 70 + i * 325
        paste_rounded(im, cover(CATALOG / name, (300, 480)), (x, 1060, x + 300, 1540), 22)
    d.text((70, 1718), "AI.EB28.CO", font=font(39, "bold"), fill=WHITE)
    d.text((70, 1780), "START WITH ONE TASK", font=font(24, "bold"), fill=LIME)
    right_arrow(d, 356, 1782, LIME, size=27, width=3)
    return im


def video_slide_02() -> Image.Image:
    im = Image.new("RGB", (VW, VH), rgb(CREAM))
    d = ImageDraw.Draw(im)
    draw_logo(d, 70, 86)
    d.text((70, 270), "Choose finished work.", font=font(72, "bold"), fill=INK)
    d.text((74, 362), "Pick the business result—not the technology.", font=font(31), fill=MUTED)
    items = [
        ("research-brief.jpg", "RESEARCH"), ("spreadsheet-cleanup.jpg", "SPREADSHEETS"),
        ("website-fix.jpg", "WEBSITE FIXES"), ("content-brief.jpg", "CONTENT"),
        ("support-backlog.jpg", "SUPPORT"), ("invoice-review.jpg", "INVOICE REVIEW"),
    ]
    for i, (name, title) in enumerate(items):
        x = 70 + (i % 2) * 485
        y = 520 + (i // 2) * 390
        paste_rounded(im, cover(CATALOG / name, (440, 300)), (x, y, x + 440, y + 300), 20)
        d.text((x, y + 320), title, font=font(23, "bold"), fill=INK)
    return im


def video_slide_03() -> Image.Image:
    im = Image.new("RGB", (VW, VH), rgb(INK))
    d = ImageDraw.Draw(im)
    draw_logo(d, 70, 86, light=True)
    d.text((70, 270), "See everything", font=font(78, "bold"), fill=WHITE)
    d.text((70, 350), "before work starts.", font=serif(72), fill=LIME)
    card = (70, 520, 1010, 1550)
    d.rounded_rectangle(card, radius=28, fill=CREAM)
    paste_rounded(im, cover(CATALOG / "research-brief.jpg", (860, 610)), (110, 560, 970, 1170), 20)
    d.text((110, 1225), "COMPETITOR SNAPSHOT", font=font(22, "bold"), fill=MUTED)
    d.text((110, 1280), "$89", font=font(94, "bold"), fill=INK)
    d.text((570, 1302), "1 BUSINESS DAY", font=font(27, "bold"), fill=OLIVE)
    d.text((110, 1415), "One competitor  •  Current sources  •  Clear finish line", font=font(22), fill=INK)
    d.text((70, 1695), "PRICE + TIMING + FINISH LINE", font=font(27, "bold"), fill=LIME)
    return im


def video_slide_04() -> Image.Image:
    im = Image.new("RGB", (VW, VH), rgb(CREAM))
    d = ImageDraw.Draw(im)
    draw_logo(d, 70, 86)
    d.text((70, 275), "Three simple steps.", font=font(78, "bold"), fill=INK)
    steps = [
        ("01", "SHARE", "Describe the job or paste your post."),
        ("02", "APPROVE", "Confirm the plan, price, and timing."),
        ("03", "RECEIVE", "Review the finished result."),
    ]
    for i, (number, title, body) in enumerate(steps):
        y = 520 + i * 345
        color = LIME if i == 0 else WHITE
        d.rounded_rectangle((70, y, 1010, y + 285), radius=26, fill=color, outline=LINE if i else None, width=2)
        d.text((112, y + 48), number, font=font(32, "bold"), fill=MUTED)
        d.text((220, y + 38), title, font=font(63, "bold"), fill=INK)
        d.text((220, y + 132), body, font=font(28), fill=INK)
        right_arrow(d, 918, y + 105, INK, size=38, width=4)
    d.text((70, 1700), "CHOOSE. APPROVE. RECEIVE.", font=font(28, "bold"), fill=INK)
    return im


def video_slide_05() -> Image.Image:
    im = Image.new("RGB", (VW, VH), rgb(INK))
    d = ImageDraw.Draw(im)
    draw_logo(d, 70, 86, light=True)
    d.text((70, 270), "No AI knowledge", font=font(75, "bold"), fill=WHITE)
    d.text((70, 350), "required.", font=serif(84), fill=LIME)
    d.text((74, 462), "Tell Bureau the result you need in plain English.", font=font(30), fill="#c9cbc2")
    screenshot_path = ROOT / "output" / "design-audit" / "03-final-mobile.png"
    if screenshot_path.exists():
        screen = Image.open(screenshot_path).convert("RGB")
    else:
        screen = cover(ROOT / "public" / "bureau-social-card.png", (390, 844))
    screen = ImageOps.fit(screen, (590, 1160), method=Image.Resampling.LANCZOS, centering=(0.5, 0.18))
    d.rounded_rectangle((225, 610, 855, 1810), radius=52, fill="#040503")
    paste_rounded(im, screen, (245, 630, 835, 1790), 38)
    return im


def video_slide_06() -> Image.Image:
    im = Image.new("RGB", (VW, VH), rgb(LIME))
    d = ImageDraw.Draw(im)
    draw_logo(d, 70, 86)
    text_block(d, (70, 350), "What do you need done today?", 104, 930, weight="bold", spacing=3)
    d.text((74, 755), "Start with one task.", font=serif(58), fill=INK)
    d.rounded_rectangle((70, 980, 1010, 1245), radius=28, fill=INK)
    d.text((115, 1045), "VISIT", font=font(28, "bold"), fill=LIME)
    d.text((115, 1100), "AI.EB28.CO", font=font(76, "bold"), fill=WHITE)
    right_arrow(d, 875, 1091, LIME, size=54, width=6)
    d.text((70, 1590), "SHARE  •  APPROVE  •  REVIEW", font=font(28, "bold"), fill=INK)
    d.text((70, 1660), "THE AI-AGENT HIRING MARKETPLACE", font=font(24), fill=INK)
    return im


def synthesize_audio(path: Path, duration: float = 18.4, sample_rate: int = 48000) -> None:
    chord_progression = [
        (110.0, 130.81, 164.81),
        (87.31, 110.0, 130.81),
        (130.81, 164.81, 196.0),
        (98.0, 123.47, 146.83),
    ]
    beat_length = 0.6
    frames = bytearray()
    total = int(duration * sample_rate)
    for i in range(total):
        t = i / sample_rate
        chord = chord_progression[int(t / (beat_length * 4)) % len(chord_progression)]
        beat_phase = t % beat_length
        note = chord[int(t / beat_length) % len(chord)] * 2
        pad = sum(math.sin(2 * math.pi * f * t) for f in chord) / 3
        pluck = math.sin(2 * math.pi * note * t) * math.exp(-6 * beat_phase)
        kick = math.sin(2 * math.pi * (54 + 22 * math.exp(-12 * beat_phase)) * t) * math.exp(-10 * beat_phase)
        sample = 0.11 * pad + 0.08 * pluck + 0.09 * kick
        fade = min(1.0, t / 0.8, (duration - t) / 1.1)
        value = int(max(-1, min(1, sample * fade)) * 32767)
        frames.extend(struct.pack("<h", value))
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(frames)


def render_video() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    slides = [video_slide_01(), video_slide_02(), video_slide_03(), video_slide_04(), video_slide_05(), video_slide_06()]
    paths: list[Path] = []
    for i, slide in enumerate(slides, 1):
        path = TMP / f"slide-{i:02d}.png"
        slide.save(path, "PNG", optimize=True)
        paths.append(path)
    cover_image = slides[0].copy()
    cover_image.save(OUT / "bureau-work-store-ad-cover.jpg", "JPEG", quality=91, optimize=True)
    audio_path = TMP / "original-audio-bed.wav"
    synthesize_audio(audio_path)

    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for path in paths:
        command.extend(["-loop", "1", "-framerate", "30", "-t", "3.4", "-i", str(path)])
    command.extend(["-i", str(audio_path)])
    filters: list[str] = []
    for i in range(len(paths)):
        filters.append(
            f"[{i}:v]scale=1080:1920,zoompan=z='min(zoom+0.00018,1.018)':"
            "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,"
            f"trim=duration=3.4,setpts=PTS-STARTPTS[v{i}]"
        )
    filters.extend([
        "[v0][v1]xfade=transition=fade:duration=0.4:offset=3.0[x1]",
        "[x1][v2]xfade=transition=fade:duration=0.4:offset=6.0[x2]",
        "[x2][v3]xfade=transition=fade:duration=0.4:offset=9.0[x3]",
        "[x3][v4]xfade=transition=fade:duration=0.4:offset=12.0[x4]",
        "[x4][v5]xfade=transition=fade:duration=0.4:offset=15.0,format=yuv420p[outv]",
        "[6:a]atrim=duration=18.4,afade=t=in:st=0:d=0.7,afade=t=out:st=17.2:d=1.2,volume=3.0[aout]",
    ])
    command.extend([
        "-filter_complex", ";".join(filters),
        "-map", "[outv]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        "-t", "18.4", str(OUT / "bureau-work-store-ad-vertical.mp4"),
    ])
    subprocess.run(command, check=True)
    shutil.rmtree(TMP)


def write_captions() -> None:
    lines = [
        "# Bureau AI Agent Marketplace Launch Campaign",
        "",
        "All creative links point to the live Bureau site. Pricing and timing match the published catalog as of July 13, 2026.",
        "",
    ]
    for index, post in enumerate(CAMPAIGN["posts"], 1):
        lines.extend([
            f"## {index}. {post['title']}",
            "",
            f"Asset: `{post['asset']}`",
            "",
            f"Instagram / Facebook: {post['primaryText']}",
            "",
            " ".join(post["hashtags"]),
            "",
            f"LinkedIn: {post['linkedInText']}",
            "",
            f"X: {post['xText']}",
            "",
            f"CTA: {post['cta']}",
            "",
            f"Destination: {post['destination']}",
            "",
            f"Alt text: {post['altText']}",
            "",
        ])
    video = CAMPAIGN["video"]
    lines.extend([
        "## Vertical video ad",
        "",
        f"Asset: `{video['asset']}`",
        "",
        f"Caption: {video['caption']}",
        "",
        f"Destination: {video['destination']}",
        "",
        f"Alt text: {video['altText']}",
        "",
        "Audio: original synthesized instrumental bed; no copyrighted music.",
        "",
    ])
    (OUT / "captions.md").write_text("\n".join(lines))


def create_contact_sheet() -> None:
    QA.mkdir(parents=True, exist_ok=True)
    thumb = 280
    gutter = 18
    label_height = 46
    sheet = Image.new("RGB", (5 * thumb + 6 * gutter, 2 * (thumb + label_height) + 3 * gutter), rgb(INK))
    d = ImageDraw.Draw(sheet)
    for index, post in enumerate(CAMPAIGN["posts"]):
        image = Image.open(OUT / post["asset"]).convert("RGB").resize((thumb, thumb), Image.Resampling.LANCZOS)
        col, row = index % 5, index // 5
        x = gutter + col * (thumb + gutter)
        y = gutter + row * (thumb + label_height + gutter)
        sheet.paste(image, (x, y))
        d.text((x, y + thumb + 9), f"{index + 1:02d}  {post['title']}", font=font(15, "bold"), fill=WHITE)
    sheet.save(QA / "campaign-contact-sheet.jpg", "JPEG", quality=92, optimize=True)


def create_bundle() -> None:
    bundle = OUT / "bureau-social-launch-campaign.zip"
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for post in CAMPAIGN["posts"]:
            archive.write(OUT / post["asset"], post["asset"])
        for name in ("bureau-work-store-ad-vertical.mp4", "bureau-work-store-ad-cover.jpg", "captions.md", "campaign.json"):
            archive.write(OUT / name, name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for post, renderer in zip(CAMPAIGN["posts"], POST_RENDERERS):
        save(renderer(), post["asset"])
    write_captions()
    render_video()
    create_contact_sheet()
    create_bundle()
    print(f"Generated 10 social posts and 1 video in {OUT}")


if __name__ == "__main__":
    main()
