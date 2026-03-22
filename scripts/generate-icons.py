# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Generate vouchgraph icon assets (PNG, ICO, SVG).

Usage: nix-shell -p resvg --run "uv run scripts/generate-icons.py"
Edit the constants at the top of this file to change the output.
"""
from __future__ import annotations

import io
import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

SIZE = 512
BG = "#0f1729"
FG = "#c4b5fd"
NODE_RADIUS = 26
EDGE_WIDTH = 4.5
EDGE_OPACITY = 0.6
ARROW_SIZE = 11
ARROW_BACK_SCALE = 0.77  # how far back the arrowhead wings extend (relative to ARROW_SIZE)
ARROW_WING_ANGLE = 2.5   # wing angle in radians from the shaft
PADDING = 60
INNER_ANGLE_DEG = 60
ICO_SIZES = [16, 32, 48, 64, 128, 256]
OUT_DIR = Path("public")


def compute_layout(
    size: int,
    node_radius: float,
    padding: float,
    inner_angle_deg: float,
) -> list[tuple[float, float]]:
    """Compute V-shaped node positions, perceptually centered in the canvas.

    The V has the given inner angle at the bottom vertex. The layout is scaled
    to fill the available space (size - 2*padding) and centered so that the
    bounding box (including node radii) is centred on both axes.
    """
    half_angle = math.radians(inner_angle_deg / 2)
    tan_ha = math.tan(half_angle)
    available = size - 2 * padding
    r = node_radius

    # Solve for h from whichever constraint is tighter:
    #   width:  2 * h * tan(ha) + 2r <= available
    #   height: h + 2r <= available
    h_from_width = (available - 2 * r) / (2 * tan_ha)
    h_from_height = available - 2 * r
    h = min(h_from_width, h_from_height)

    cx = size / 2
    # Centre the bounding box vertically:
    #   vertical centre of content = bottom_y - h/2
    #   we want that at size/2
    bottom_y = size / 2 + h / 2
    top_y = bottom_y - h
    half_w = h * tan_ha

    return [
        (cx - half_w, top_y),  # top-left
        (cx + half_w, top_y),  # top-right
        (cx, bottom_y),        # bottom-center
    ]


def generate_svg(
    size: int,
    bg: str | None,
    fg: str,
    node_radius: float,
    edge_width: float,
    edge_opacity: float,
    arrow_size: float,
    padding: float,
    inner_angle_deg: float,
) -> str:
    nodes = compute_layout(size, node_radius, padding, inner_angle_deg)

    # Edges: top-left → bottom, bottom → top-right
    edges = [
        (nodes[0], nodes[2]),
        (nodes[2], nodes[1]),
    ]

    bg_rect = ""
    if bg:
        bg_rect = f'  <rect width="{size}" height="{size}" fill="{bg}"/>\n'

    lines_svg = ""
    arrows_svg = ""
    for (x1, y1), (x2, y2) in edges:
        lines_svg += (
            f'  <line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{fg}" stroke-opacity="{edge_opacity}" stroke-width="{edge_width}"/>\n'
        )
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        angle_deg = math.degrees(math.atan2(y2 - y1, x2 - x1))
        a = arrow_size
        b = a * ARROW_BACK_SCALE
        arrows_svg += (
            f'  <g transform="translate({mx:.1f}, {my:.1f}) rotate({angle_deg:.1f})">\n'
            f'    <polygon points="{a},0 {-b},{b} {-b},{-b}" '
            f'fill="{fg}" fill-opacity="{edge_opacity}"/>\n'
            f'  </g>\n'
        )

    circles_svg = ""
    for nx, ny in nodes:
        circles_svg += f'  <circle cx="{nx:.1f}" cy="{ny:.1f}" r="{node_radius}" fill="{fg}"/>\n'

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}">\n'
        f'{bg_rect}'
        f'{lines_svg}{arrows_svg}{circles_svg}'
        f'</svg>\n'
    )


def svg_to_png(svg: str, size: int) -> bytes:
    """Render SVG to PNG using resvg."""
    with tempfile.NamedTemporaryFile(suffix=".svg", mode="w", delete=False) as f:
        f.write(svg)
        svg_path = f.name
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        png_path = f.name
    try:
        subprocess.run(
            ["resvg", svg_path, png_path, "-w", str(size), "-h", str(size)],
            check=True, capture_output=True,
        )
        return Path(png_path).read_bytes()
    finally:
        Path(svg_path).unlink(missing_ok=True)
        Path(png_path).unlink(missing_ok=True)


def png_bytes_to_image(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGBA")


def main():
    out = OUT_DIR
    out.mkdir(parents=True, exist_ok=True)

    params = dict(
        size=SIZE,
        fg=FG,
        node_radius=NODE_RADIUS,
        edge_width=EDGE_WIDTH,
        edge_opacity=EDGE_OPACITY,
        arrow_size=ARROW_SIZE,
        padding=PADDING,
        inner_angle_deg=INNER_ANGLE_DEG,
    )

    # SVG (with background, for use in the app)
    svg_content = generate_svg(bg=BG, **params)
    svg_path = out / "vouchgraph-icon.svg"
    svg_path.write_text(svg_content)
    print(f"wrote {svg_path}")

    # PNG (og-image, with background)
    png_data = svg_to_png(svg_content, SIZE)
    png_path = out / "og-image.png"
    png_path.write_bytes(png_data)
    print(f"wrote {png_path}")

    # ICO (multi-size, transparent background)
    ico_path = out / "favicon.ico"
    svg_transparent = generate_svg(bg=None, **params)
    ico_images = []
    for s in ICO_SIZES:
        data = svg_to_png(svg_transparent, s)
        ico_images.append(png_bytes_to_image(data))
    ico_images[0].save(
        ico_path, format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=ico_images[1:],
    )
    print(f"wrote {ico_path}")


if __name__ == "__main__":
    main()
