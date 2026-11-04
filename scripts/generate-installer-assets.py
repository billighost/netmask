"""Generate Fieldnotes installer artwork from the selected transparent logo.

Requires Pillow. Native builds use the committed images without Python.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "src-tauri" / "installer"
DESTINATION.mkdir(parents=True, exist_ok=True)
ICON = Image.open(ROOT / "resources" / "icon.png").convert("RGBA")
PAPER = "#f6f3ec"
INK = "#294e3f"
MUTED = "#646f61"
RULE = "#d7dccc"
ACCENT = "#ba5c3c"


def font(size, serif=False):
    candidates = [
        Path("C:/Windows/Fonts") / ("georgia.ttf" if serif else "segoeui.ttf"),
        Path("/System/Library/Fonts/Supplemental") / ("Georgia.ttf" if serif else "Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSerif.ttf" if serif else "DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size=size)


def emblem(image, x, y, size):
    mark = ICON.resize((size, size), Image.Resampling.LANCZOS)
    image.paste(mark, (x, y), mark)


def sidebar(width, height):
    image = Image.new("RGB", (width, height), PAPER)
    drawing = ImageDraw.Draw(image)
    drawing.line((18, 24, width - 18, 24), fill=RULE, width=1)
    emblem(image, width // 2 - 51, 48, 102)
    drawing.text((18, 175), "NetMask", font=font(25, serif=True), fill=INK)
    drawing.text((19, 218), "Your networks.", font=font(12), fill=MUTED)
    drawing.text((19, 238), "Your names.", font=font(12), fill=MUTED)
    drawing.line((19, height - 29, width - 19, height - 29), fill=RULE, width=1)
    drawing.ellipse((19, height - 18, 23, height - 14), fill=ACCENT)
    return image


sidebar(164, 314).save(DESTINATION / "nsis-sidebar.bmp")
header = Image.new("RGB", (150, 57), "white")
emblem(header, 108, 9, 40)
ImageDraw.Draw(header).text((6, 18), "NetMask", font=font(17, serif=True), fill=INK)
header.save(DESTINATION / "nsis-header.bmp")

# WiX draws its own page title on the left. Keep that area empty.
wix_header = Image.new("RGB", (493, 58), "white")
emblem(wix_header, 436, 7, 44)
wix_header.save(DESTINATION / "wix-banner.bmp")
wix_dialog = Image.new("RGB", (493, 312), "white")
wix_dialog.paste(sidebar(164, 312), (0, 0))
wix_dialog.save(DESTINATION / "wix-dialog.bmp")

dmg = Image.new("RGB", (660, 400), PAPER)
drawing = ImageDraw.Draw(dmg)
emblem(dmg, 28, 22, 44)
drawing.text((84, 19), "NetMask", font=font(27, serif=True), fill=INK)
drawing.text((85, 55), "A little room for your network.", font=font(12), fill=MUTED)
drawing.line((30, 92, 630, 92), fill=RULE, width=1)
drawing.line((288, 200, 372, 200), fill=INK, width=2)
drawing.line((361, 189, 372, 200, 361, 211), fill=INK, width=2)
drawing.text((330, 298), "Drag NetMask into Applications", font=font(22, serif=True), fill=INK, anchor="mm")
drawing.text((330, 333), "Then open it from your Applications folder.", font=font(12), fill=MUTED, anchor="mm")
dmg.save(DESTINATION / "dmg-background.png", optimize=True)
print("Generated Fieldnotes artwork for the Windows installers and macOS disk image.")
