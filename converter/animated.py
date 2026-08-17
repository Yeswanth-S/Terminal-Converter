"""Animated media conversions (GIF/WebP/APNG/AVIF/Video).
Centralizes all animated workflows through ffmpeg for unified resolution/fps control."""

from __future__ import annotations
from pathlib import Path
from contextlib import contextmanager
import zipfile
import tempfile
import subprocess

from .errors import ConversionError
from .video_audio import _run_ffmpeg
from . import images  # noqa: F401 (Registers AVIF/HEIF Pillow plugins process-wide)

from PIL import Image, ImageSequence

CIRCLE_FORMATS = {"gif", "webp", "apng", "avif"}
THUMBNAIL_FORMATS = {"png", "jpg", "jpeg", "webp"}
VIDEO_TARGETS = {"mp4", "webm"}

# Cached capability probe result for animated WebP decoding.
_animated_webp_decode_supported: bool | None = None


def _ffmpeg_supports_animated_webp_decode() -> bool:
    """Probes if the running ffmpeg supports animated WebP decoding (fixed in v9.0+)."""
    global _animated_webp_decode_supported
    if _animated_webp_decode_supported is not None:
        return _animated_webp_decode_supported

    try:
        with tempfile.TemporaryDirectory() as td:
            tdp = Path(td)
            probe_src = tdp / "probe.gif"
            Image.new("RGB", (8, 8), (255, 0, 0)).save(
                probe_src, save_all=True,
                append_images=[Image.new("RGB", (8, 8), (0, 255, 0))],
                duration=100, loop=0,
            )
            probe_webp = tdp / "probe.webp"
            enc = subprocess.run(
                ["ffmpeg", "-y", "-i", str(probe_src), "-c:v", "libwebp_anim",
                 "-loop", "0", str(probe_webp)],
                capture_output=True, timeout=15,
            )
            if enc.returncode != 0:
                _animated_webp_decode_supported = False
                return False

            probe_out = tdp / "probe_out.png"
            dec = subprocess.run(
                ["ffmpeg", "-y", "-i", str(probe_webp), "-vframes", "1", str(probe_out)],
                capture_output=True, timeout=15,
            )
            _animated_webp_decode_supported = dec.returncode == 0 and probe_out.exists()
    except Exception:
        _animated_webp_decode_supported = False  # Safe fallback

    return _animated_webp_decode_supported


@contextmanager
def _safe_input(input_path: Path):
    """Yields ffmpeg input args. Pre-decodes WebP via Pillow if ffmpeg lacks support."""
    if input_path.suffix.lower() != ".webp":
        yield ["-i", str(input_path)]
        return

    try:
        img = Image.open(input_path)
        animated = bool(getattr(img, "is_animated", False))
    except Exception as e:
        raise ConversionError(f"Couldn't read {input_path.name}: {e}") from e

    if not animated or _ffmpeg_supports_animated_webp_decode():
        yield ["-i", str(input_path)]
        return

    with tempfile.TemporaryDirectory() as td:
        tdp = Path(td)
        durations = []
        for i, frame in enumerate(ImageSequence.Iterator(img)):
            frame.convert("RGBA").save(tdp / f"src_{i:04d}.png")
            durations.append(frame.info.get("duration", 100) or 100)
            
        if not durations:
            raise ConversionError(f"{input_path.name} has no readable frames.")
            
        avg_ms = sum(durations) / len(durations)
        fps = max(1, round(1000 / avg_ms)) if avg_ms > 0 else 10
        yield ["-framerate", str(fps), "-i", str(tdp / "src_%04d.png")]


# Defaults for video-to-animated conversions (res/fps caps).
DEFAULT_VIDEO_TO_ANIMATED = {
    "gif": {"width": 480, "fps": 12},
    "webp": {"width": 720, "fps": 15},
}


def is_animated(source) -> bool:
    """Content-aware animation check for ambiguous extensions (webp/png/avif)."""
    try:
        img = Image.open(source)
        return bool(getattr(img, "is_animated", False))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Animated -> Animated (No Resize)
# ---------------------------------------------------------------------------

def convert_circle(input_path: Path, output_path: Path, target_format: str,
                   original_name: str | None = None) -> None:
    target_format = target_format.lower()
    display_name = original_name or input_path.name

    if target_format == "gif":
        _to_gif(input_path, output_path, scale_filter=None, fps=None, label=display_name)
        return

    with _safe_input(input_path) as in_args:
        if target_format == "webp":
            _run_ffmpeg([
                *in_args,
                "-c:v", "libwebp_anim", "-loop", "0", "-quality", "90",
                str(output_path),
            ], f"{display_name} -> webp")
        elif target_format == "apng":
            _run_ffmpeg([
                *in_args, "-f", "apng", "-plays", "0",
                str(output_path),
            ], f"{display_name} -> apng")
        elif target_format == "avif":
            _run_ffmpeg([
                *in_args,
                "-c:v", "libaom-av1", "-still-picture", "0",
                "-crf", "30", "-cpu-used", "6",
                str(output_path),
            ], f"{display_name} -> avif")
        else:
            raise ConversionError(f"Unsupported animated target: .{target_format}")


# ---------------------------------------------------------------------------
# Animated -> Video
# ---------------------------------------------------------------------------

def convert_to_video(input_path: Path, output_path: Path, target_format: str,
                      original_name: str | None = None) -> None:
    target_format = target_format.lower()
    if target_format not in VIDEO_TARGETS:
        raise ConversionError(f"Unsupported video target: .{target_format}")

    with _safe_input(input_path) as in_args:
        if target_format == "mp4":
            args = [*in_args, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(output_path)]
        else:
            # Force yuv420p to prevent libvpx-vp9 from failing on yuva420p (alpha channel) sources.
            args = [*in_args, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p",
                    "-row-mt", "1", "-crf", "30", "-b:v", "0", str(output_path)]

        _run_ffmpeg(args, f"{original_name or input_path.name} -> {target_format}")


# ---------------------------------------------------------------------------
# Video -> Animated (Applies Resize/FPS Caps)
# ---------------------------------------------------------------------------

def convert_video_to_animated(input_path: Path, output_path: Path, target_format: str,
                               width: int | None = None, fps: int | None = None,
                               original_name: str | None = None) -> None:
    target_format = target_format.lower()
    display_name = original_name or input_path.name

    if target_format not in DEFAULT_VIDEO_TO_ANIMATED:
        raise ConversionError(f"Video can't convert to .{target_format}")

    if target_format == "gif":
        scale = f"scale={width}:-1:flags=lanczos" if width else None
        _to_gif(input_path, output_path, scale_filter=scale, fps=fps, label=display_name)
    else:  # webp
        parts = []
        if fps:
            parts.append(f"fps={fps}")
        if width:
            parts.append(f"scale={width}:-1:flags=lanczos")
        args = ["-i", str(input_path)]
        if parts:
            args += ["-vf", ",".join(parts)]
        args += ["-c:v", "libwebp_anim", "-loop", "0", "-quality", "90", str(output_path)]
        _run_ffmpeg(args, f"{display_name} -> webp")


def _to_gif(input_path: Path, output_path: Path, scale_filter: str | None,
            fps: int | None, label: str) -> None:
    """Two-pass GIF encode using a generated palette for optimal quality."""
    parts = []
    if fps is not None:
        parts.append(f"fps={fps}")
    if scale_filter is not None:
        parts.append(scale_filter)
        
    filters = ",".join(parts) if parts else None
    palette_path = output_path.with_suffix(".palette.png")
    gen_vf = f"{filters},palettegen" if filters else "palettegen"

    with _safe_input(input_path) as in_args:
        _run_ffmpeg([*in_args, "-vf", gen_vf, str(palette_path)],
                    f"{label}: palette generation", report_progress=False)
        try:
            use_filter = (f"{filters}[x];[x][1:v]paletteuse" if filters
                          else "[0:v][1:v]paletteuse")
            _run_ffmpeg([
                *in_args, "-i", str(palette_path),
                "-lavfi", use_filter, str(output_path),
            ], f"{label}: gif encode")
        finally:
            palette_path.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Extractions (Thumbnail & Frames)
# ---------------------------------------------------------------------------

def extract_thumbnail(input_path: Path, output_path: Path, target_format: str,
                       original_name: str | None = None) -> None:
    target_format = target_format.lower()
    if target_format not in THUMBNAIL_FORMATS:
        raise ConversionError(f"Unsupported thumbnail target: .{target_format}")
        
    with _safe_input(input_path) as in_args:
        args = [*in_args, "-vframes", "1", str(output_path)]
        _run_ffmpeg(args, f"{original_name or input_path.name} -> {target_format} thumbnail")


def extract_frames_zip(input_path: Path, output_path: Path, target_format: str | None = None,
                        original_name: str | None = None) -> None:
    display_name = original_name or input_path.name
    stem = Path(display_name).stem

    with _safe_input(input_path) as in_args, tempfile.TemporaryDirectory() as tmp:
        pattern = str(Path(tmp) / "frame_%04d.png")
        _run_ffmpeg([*in_args, pattern], f"{display_name}: frame extraction")

        frame_files = sorted(Path(tmp).glob("frame_*.png"))
        if not frame_files:
            raise ConversionError(f"No frames could be extracted from {display_name}")

        try:
            with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
                for i, fp in enumerate(frame_files):
                    zf.write(fp, arcname=f"{stem}_frame_{i:03d}.png")
        except Exception as e:
            raise ConversionError(f"Failed to build frame archive: {e}") from e