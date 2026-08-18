"""JSON configuration loaded at startup.
Creates config.json with defaults if missing."""

from __future__ import annotations
import json
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

DEFAULTS = {
    # Days to keep job input/output files and history before deletion.
    "job_retention_days": 30,

    # Days to keep ffmpeg debug logs (must be <= job_retention_days).
    "log_retention_days": 30,

    # Days to keep input files for failed jobs to allow for retries.
    "failed_input_retention_days": 7,

    # Run file cleanup sweep at server startup.
    "cleanup_on_startup": True,

    # Directory for job files. null = system temp dir (recommended).
    # WARNING: If set to a real path, it MUST be outside the project directory to prevent Flask reload loops.
    "storage_dir": None,

    # Write ffmpeg output to persistent log files per task.
    "enable_conversion_logs": True,
}

def load_config() -> dict:
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(json.dumps(DEFAULTS, indent=2) + "\n", encoding="utf-8")
        return dict(DEFAULTS)

    try:
        on_disk = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        # Fallback to defaults on malformed config to prevent server crashes.
        return dict(DEFAULTS)

    # Merge disk config over defaults to ensure all required keys exist.
    merged = dict(DEFAULTS)
    merged.update({k: v for k, v in on_disk.items() if k in DEFAULTS})
    
    return merged