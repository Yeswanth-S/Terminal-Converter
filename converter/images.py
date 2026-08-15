"""Pure-Pillow image conversion. Fast path for straightforward 
image-to-image work without ffmpeg."""

from __future__ import annotations
from pathlib import Path
from PIL import Image
from .errors import ConversionError

# Register plugins to support AVIF/HEIC in Pillow
try:
    import pillow_avif  # noqa: F401
    _HAS_AVIF = True
except ImportError:
    _HAS_AVIF = False

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HAS_HEIF = True
except ImportError:
    _HAS_HEIF = False

_SAVE_FORMAT = {
    "jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP",
    "bmp": "BMP", "tiff": "TIFF", "avif": "AVIF", "heic": "HEIF",
}

# Formats that require a solid background (no alpha channel support).
_NO_ALPHA = {"JPEG", "BMP"}


def convert_image(input_path: Path, output_path: Path, target_format: str, original_name: str | None = None) -> None:
    target_format = target_format.lower()

    if target_format == "avif" and not _HAS_AVIF:
        raise ConversionError("AVIF support isn't installed on this server (pillow-avif-plugin missing).")
    if target_format == "heic" and not _HAS_HEIF:
        raise ConversionError("HEIC support isn't installed on this server (pillow-heif missing).")

    save_format = _SAVE_FORMAT.get(target_format)
    if not save_format:
        raise ConversionError(f"Unsupported image target: .{target_format}")

    try:
        img = Image.open(input_path)
        img.load()
    except Exception as e:
        raise ConversionError(f"Couldn't read source image: {e}") from e

    # Extract the first frame if the source is animated.
    if getattr(img, "is_animated", False):
        img.seek(0)

    # Flatten alpha channels onto a white background for formats that don't support transparency.
    if save_format in _NO_ALPHA and img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        img = background
    elif save_format not in _NO_ALPHA and img.mode == "P":
        img = img.convert("RGBA")

    save_kwargs = {}
    if save_format == "JPEG":
        save_kwargs["quality"] = 92
        save_kwargs["optimize"] = True
    elif save_format == "WEBP":
        save_kwargs["quality"] = 92
    elif save_format == "PNG":
        save_kwargs["optimize"] = True

    try:
        img.save(output_path, format=save_format, **save_kwargs)
    except Exception as e:
        raise ConversionError(f"Failed to write .{target_format}: {e}") from e