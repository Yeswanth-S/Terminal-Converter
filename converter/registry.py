"""
Supported types and formats.

Every input file is classified into a FileKind, which determines its available target formats.
Use `classify_content()` to reliably differentiate static images from animated files (webp/png/avif) 
by checking frame counts, as extensions alone are ambiguous.
"""

from __future__ import annotations
from enum import Enum


class FileKind(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    SVG = "svg"
    ANIMATED = "animated"


# Default classification by extension.
EXTENSION_KIND: dict[str, FileKind] = {
    # Images (Pillow-backed)
    "jpg": FileKind.IMAGE, "jpeg": FileKind.IMAGE, "png": FileKind.IMAGE,
    "webp": FileKind.IMAGE, "bmp": FileKind.IMAGE, "tiff": FileKind.IMAGE,
    "tif": FileKind.IMAGE, "avif": FileKind.IMAGE, "heic": FileKind.IMAGE,
    "heif": FileKind.IMAGE,
    # SVG (resvg-backed)
    "svg": FileKind.SVG,
    # Animated
    "gif": FileKind.ANIMATED, "apng": FileKind.ANIMATED,
    # Video (ffmpeg-backed)
    "mp4": FileKind.VIDEO, "mkv": FileKind.VIDEO, "mov": FileKind.VIDEO,
    "avi": FileKind.VIDEO, "webm": FileKind.VIDEO, "flv": FileKind.VIDEO,
    "wmv": FileKind.VIDEO,
    # Audio (ffmpeg-backed)
    "mp3": FileKind.AUDIO, "wav": FileKind.AUDIO, "flac": FileKind.AUDIO,
    "aac": FileKind.AUDIO, "ogg": FileKind.AUDIO, "opus": FileKind.AUDIO,
    "wma": FileKind.AUDIO,
}

# Extensions that require content inspection to distinguish static vs animated.
AMBIGUOUS_EXTENSIONS = {"webp", "png", "avif"}

# Available target formats grouped by UI category.
TARGET_GROUPS: dict[FileKind, dict[str, list[str]]] = {
    FileKind.IMAGE: {
        "default": ["jpg", "png", "webp", "bmp", "tiff", "avif", "heic"],
    },
    FileKind.SVG: {
        "default": ["png", "jpg", "webp"],
    },
    FileKind.AUDIO: {
        "default": ["mp3", "wav", "flac", "aac", "ogg", "opus", "wma"],
    },
    FileKind.ANIMATED: {
        "convert": ["gif", "webp", "apng", "avif"],
        "thumbnail": ["png", "jpg", "webp"],
        "frames": ["frames"],
        "video": ["mp4", "webm"],
    },
    FileKind.VIDEO: {
        "video": ["mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "h264", "h265"],
        "audio": ["mp3", "wav", "flac", "aac", "ogg", "opus", "wma"],
        "animated": ["gif", "webp"],
    },
}

# Flattened validation view.
TARGETS: dict[FileKind, list[str]] = {
    kind: [fmt for group in groups.values() for fmt in group]
    for kind, groups in TARGET_GROUPS.items()
}

# Codec pseudo-formats mapped to MP4 containers.
CODEC_TARGETS: dict[str, dict] = {
    "h264": {"container": "mp4", "video_codec": "libx264"},
    "h265": {"container": "mp4", "video_codec": "libx265"},
}

MAX_UPLOAD_BYTES = 500 * 1024 * 1024
MAX_FILES_PER_JOB = 20


def classify(filename: str) -> FileKind | None:
    """Extension-only classification. Defaults ambiguous extensions to IMAGE."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return EXTENSION_KIND.get(ext)


def classify_content(filename: str, source) -> FileKind | None:
    """Content-aware classification that inspects ambiguous files for animations."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    kind = EXTENSION_KIND.get(ext)
    
    if kind is None or ext not in AMBIGUOUS_EXTENSIONS:
        return kind

    from .animated import is_animated  # Deferred to prevent circular import
    return FileKind.ANIMATED if is_animated(source) else FileKind.IMAGE


def targets_for(kind: FileKind) -> list[str]:
    return TARGETS.get(kind, [])


def groups_for(kind: FileKind) -> dict[str, list[str]]:
    return TARGET_GROUPS.get(kind, {})


def allowed_extensions() -> set[str]:
    return set(EXTENSION_KIND.keys())