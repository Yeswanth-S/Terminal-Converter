"""SVG rasterization via `resvg` (pure wheel, no system libcairo/GTK dependencies)."""

from __future__ import annotations
from pathlib import Path
import io
import resvg
from PIL import Image
from .errors import ConversionError

SUPPORTED_TARGETS = {"png", "jpg", "jpeg", "webp"}


def convert_svg(input_path: Path, output_path: Path, target_format: str, original_name: str | None = None) -> None:
    target_format = target_format.lower()
    if target_format not in SUPPORTED_TARGETS:
        raise ConversionError(
            f"Unsupported SVG target: .{target_format} "
            f"(SVG can convert to: {', '.join(sorted(SUPPORTED_TARGETS))})"
        )

    try:
        svg_text = input_path.read_text(encoding="utf-8", errors="replace")
        opts = resvg.usvg.Options.default()
        tree = resvg.usvg.Tree.from_str(svg_text, opts)
        
        # Identity matrix uses `affine` package convention (a,b,c, d,e,f), not standard SVG order.
        # Using (1,0,0, 0,1,0) prevents silent rendering failures (blank/transparent output).
        png_bytes = resvg.render(tree, (1, 0, 0, 0, 1, 0))
    except Exception as e:
        raise ConversionError(f"Couldn't render SVG: {e}") from e

    if target_format == "png":
        output_path.write_bytes(png_bytes)
        return

    # resvg only emits PNG. Use Pillow to transcode to jpg/webp.
    try:
        img = Image.open(io.BytesIO(png_bytes))
        if target_format in ("jpg", "jpeg"):
            # Flatten alpha channel onto a white background for JPEGs.
            background = Image.new("RGB", img.size, (255, 255, 255))
            rgba = img.convert("RGBA")
            background.paste(rgba, mask=rgba.split()[-1])
            background.save(output_path, format="JPEG", quality=92, optimize=True)
        else:  # webp
            img.save(output_path, format="WEBP", quality=92)
    except Exception as e:
        raise ConversionError(f"Failed to write .{target_format}: {e}") from e