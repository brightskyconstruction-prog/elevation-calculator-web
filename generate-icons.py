"""
generate-icons.py
=================
Run this ONCE from the root of the project to generate the PWA icons.

  pip install Pillow
  python generate-icons.py

Produces inside public/:
  icon-192.png       — Android home screen / PWA manifest (192×192)
  icon-512.png       — Android splash / install banner  (512×512)
  apple-touch-icon.png — iOS "Add to Home Screen"       (180×180)

Each icon is:  navy-blue background  +  yellow border frame  +  rod image centred.
The source image (public/rod.png) is used AS-IS — not regenerated or redesigned.
"""

from pathlib import Path
from PIL import Image, ImageDraw

# ── Brand colours (must match the app) ────────────────────────────────────────
NAVY   = (20,  58,  99)   # #143A63
YELLOW = (244, 176, 42)   # #F4B02A

# ── Icon sizes to generate ─────────────────────────────────────────────────────
SIZES = {
    "icon-192.png":        192,
    "icon-512.png":        512,
    "apple-touch-icon.png": 180,
}

def make_icon(rod: Image.Image, size: int) -> Image.Image:
    """
    Compose one square icon:
      1. Navy blue background
      2. Yellow border rectangle (8 % inset on each side)
      3. Rod image scaled to fit the inner area (with a small additional 4 % padding)
    """
    # --- background ---
    icon = Image.new("RGBA", (size, size), (*NAVY, 255))

    # --- yellow border ---
    # 13 % inset from each edge → visible blue margin between icon edge and
    # the yellow frame, giving a cleaner, more balanced appearance.
    border  = max(6, round(size * 0.13))
    stroke  = max(3, round(size * 0.025))  # ~2.5 % stroke width
    draw    = ImageDraw.Draw(icon)
    draw.rectangle(
        [border, border, size - border - 1, size - border - 1],
        outline=(*YELLOW, 255),
        width=stroke,
    )

    # --- rod image ---
    inner_pad  = border + stroke + max(2, round(size * 0.02))  # tight padding inside border
    inner_size = size - inner_pad * 2

    rod_copy = rod.copy()
    rod_copy.thumbnail((inner_size, inner_size), Image.LANCZOS)

    # Centre the rod within the icon
    rx = (size - rod_copy.width)  // 2
    ry = (size - rod_copy.height) // 2

    # Composite (handles RGBA transparency in the source)
    icon.paste(rod_copy, (rx, ry), rod_copy if rod_copy.mode == "RGBA" else None)

    return icon.convert("RGB")


def main():
    src = Path("public/rod.png")
    if not src.exists():
        raise FileNotFoundError(
            "public/rod.png not found — run this script from the project root."
        )

    rod = Image.open(src).convert("RGBA")
    print(f"Loaded {src}  ({rod.width}×{rod.height})")

    public = Path("public")
    for filename, size in SIZES.items():
        icon = make_icon(rod, size)
        out  = public / filename
        icon.save(out, "PNG", optimize=True)
        print(f"  ✓  {out}  ({size}×{size})")

    print("\nDone. Commit the generated files and redeploy.")


if __name__ == "__main__":
    main()
