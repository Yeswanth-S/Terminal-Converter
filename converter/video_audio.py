"""Video and audio conversion via ffmpeg subprocess calls.
Captures stderr for accurate error reporting in the terminal UI."""

from __future__ import annotations
from pathlib import Path
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable
import subprocess
import threading
import time
from .errors import ConversionError, Cancelled
from .registry import CODEC_TARGETS

FFMPEG_BIN = "ffmpeg"
FFPROBE_BIN = "ffprobe"

@dataclass
class _TaskContext:
    log_path: Path | None = None
    on_progress: Callable[[float], None] | None = None
    total_duration: float | None = None
    register_proc: Callable[[subprocess.Popen], None] | None = None
    unregister_proc: Callable[[], None] | None = None
    is_cancelled: Callable[[], bool] | None = None


# Thread-local context prevents state leakage across concurrent worker threads.
_ctx = threading.local()

@contextmanager
def task_context(log_path: Path | None = None,
                 on_progress: Callable[[float], None] | None = None,
                 total_duration: float | None = None,
                 register_proc: Callable[[subprocess.Popen], None] | None = None,
                 unregister_proc: Callable[[], None] | None = None,
                 is_cancelled: Callable[[], bool] | None = None):
    prev = getattr(_ctx, "current", None)
    _ctx.current = _TaskContext(
        log_path, on_progress, total_duration,
        register_proc, unregister_proc, is_cancelled
    )
    try:
        yield
    finally:
        _ctx.current = prev

def _current_ctx() -> _TaskContext:
    return getattr(_ctx, "current", None) or _TaskContext()

def _append_log(cmd: list[str], returncode: int | None, stderr: str | None,
                label: str, extra: str | None = None) -> None:
    path = _current_ctx().log_path
    if path is None:
        return
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"--- {label} @ {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            f.write(f"$ {' '.join(cmd)}\n")
            if returncode is not None:
                f.write(f"exit code: {returncode}\n")
            if stderr:
                f.write(stderr if stderr.endswith("\n") else stderr + "\n")
            if extra:
                f.write(extra + "\n")
            f.write("\n")
    except OSError:
        pass  # Never let a log-write failure crash a successful conversion

_CONTAINER_ARGS = {
    "mp4": ["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
    "mkv": [],
    "mov": [],
    "avi": ["-c:v", "libx264", "-crf", "26", "-pix_fmt", "yuv420p",
            "-c:a", "libmp3lame", "-q:a", "3"],
    "webm": ["-c:v", "libvpx-vp9", "-row-mt", "1", "-crf", "30", "-b:v", "0",
             "-c:a", "libopus"],
    "flv": ["-c:v", "libx264", "-c:a", "aac"],
    "wmv": ["-c:v", "wmv2", "-c:a", "wmav2"],
}

_AUDIO_CODEC_ARGS = {
    "mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
    "wav": ["-c:a", "pcm_s16le"],
    "flac": ["-c:a", "flac"],
    "aac": ["-c:a", "aac", "-b:a", "192k"],
    "ogg": ["-c:a", "libvorbis", "-q:a", "5"],
    "opus": ["-c:a", "libopus", "-b:a", "128k"],
    "wma": ["-c:a", "wmav2"],
}

_TIMEOUT_SECONDS = 15 * 60  # 15 min ceiling for large jobs

def probe_duration(input_path: Path) -> float | None:
    cmd = [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration",
           "-of", "csv=p=0", str(input_path)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return float(result.stdout.strip())
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        return None

def _run_ffmpeg(args: list[str], label: str, report_progress: bool = True) -> None:
    ctx = _current_ctx()
    cmd = [FFMPEG_BIN, "-y", "-hide_banner", "-loglevel", "error"]
    
    if report_progress:
        cmd += ["-progress", "pipe:1", "-nostats"]
    cmd += args

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, bufsize=1)
    except FileNotFoundError as e:
        _append_log(cmd, None, None, label, extra="ffmpeg not found on PATH")
        raise ConversionError(
            "ffmpeg isn't installed or isn't on PATH. Install it and ensure `ffmpeg -version` works."
        ) from e

    if ctx.register_proc:
        ctx.register_proc(proc)

    # Drain stderr on a background thread to prevent deadlocking if the pipe fills up
    stderr_lines: list[str] = []
    def _drain_stderr():
        for line in proc.stderr:
            stderr_lines.append(line)
            
    stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
    stderr_thread.start()

    start_time = time.monotonic()
    timed_out = False
    current_block: dict[str, str] = {}

    if report_progress:
        for line in proc.stdout:
            if time.monotonic() - start_time > _TIMEOUT_SECONDS:
                proc.terminate()
                timed_out = True
                break
            if ctx.is_cancelled and ctx.is_cancelled():
                proc.terminate()
                break

            line = line.strip()
            if "=" not in line:
                continue
                
            key, _, val = line.partition("=")
            current_block[key] = val
            
            if key != "progress":
                continue

            if val == "end" and ctx.on_progress:
                ctx.on_progress(100.0)
            elif ctx.on_progress and ctx.total_duration and current_block.get("out_time_us", "N/A") != "N/A":
                try:
                    elapsed = int(current_block["out_time_us"]) / 1_000_000
                    # Clamp pct to handle edge-case negative timestamps right at stream start
                    pct = max(0.0, min(100.0, (elapsed / ctx.total_duration) * 100))
                    ctx.on_progress(pct)
                except (ValueError, ZeroDivisionError):
                    pass
            current_block = {}
    else:
        # Silently drain stdout (e.g. for palettegen passes where progress jumps backwards otherwise)
        for _ in proc.stdout:
            if time.monotonic() - start_time > _TIMEOUT_SECONDS:
                proc.terminate()
                timed_out = True
                break
            if ctx.is_cancelled and ctx.is_cancelled():
                proc.terminate()
                break

    proc.wait()
    stderr_thread.join()
    
    if ctx.unregister_proc:
        ctx.unregister_proc()

    stderr = "".join(stderr_lines)

    if timed_out:
        _append_log(cmd, proc.returncode, stderr, label, extra=f"timed out after {_TIMEOUT_SECONDS}s")
        raise ConversionError(f"{label} timed out after {_TIMEOUT_SECONDS // 60} minutes.")

    if proc.returncode != 0:
        if ctx.is_cancelled and ctx.is_cancelled():
            _append_log(cmd, proc.returncode, stderr, label, extra="cancelled by user")
            raise Cancelled()
            
        _append_log(cmd, proc.returncode, stderr, label)
        lines = [l for l in stderr.strip().splitlines() if l.strip()]
        tail = "\n".join(lines[-6:]) if lines else "no error output captured"
        raise ConversionError(f"{label} failed:\n{tail}")

    _append_log(cmd, proc.returncode, stderr, label)

def _has_audio_stream(input_path: Path) -> bool:
    cmd = [FFPROBE_BIN, "-v", "error", "-select_streams", "a",
           "-show_entries", "stream=index", "-of", "csv=p=0", str(input_path)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return True
    return bool(result.stdout.strip())

def convert_video(input_path: Path, output_path: Path, target_format: str,
                  original_name: str | None = None) -> None:
    target_format = target_format.lower()
    display_name = original_name or input_path.name

    if target_format in _AUDIO_CODEC_ARGS:
        if not _has_audio_stream(input_path):
            raise ConversionError(f"{display_name} has no audio track to extract.")
            
        args = ["-i", str(input_path), "-vn", *_AUDIO_CODEC_ARGS[target_format], str(output_path)]
        _run_ffmpeg(args, f"Audio extraction to .{target_format}")
        return

    if target_format in CODEC_TARGETS:
        spec = CODEC_TARGETS[target_format]
        # Force yuv420p to prevent 10-bit/4:4:4 sources from breaking browser playback.
        args = ["-i", str(input_path), "-c:v", spec["video_codec"],
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", str(output_path)]
        _run_ffmpeg(args, f"Video encode ({target_format})")
        return

    if target_format not in _CONTAINER_ARGS:
        raise ConversionError(f"Unsupported video target: .{target_format}")

    codec_args = _CONTAINER_ARGS[target_format]
    args = ["-i", str(input_path), *codec_args, str(output_path)]
    _run_ffmpeg(args, f"Video conversion to .{target_format}")

def convert_audio(input_path: Path, output_path: Path, target_format: str,
                  original_name: str | None = None) -> None:
    target_format = target_format.lower()
    codec_args = _AUDIO_CODEC_ARGS.get(target_format)
    
    if codec_args is None:
        raise ConversionError(f"Unsupported audio target: .{target_format}")

    args = ["-i", str(input_path), "-vn", *codec_args, str(output_path)]
    _run_ffmpeg(args, f"Audio conversion to .{target_format}")