"""Job store and background thread pool for batch conversions.
Backed by SQLite so jobs and history survive server restarts.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import logging
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import uuid
import zipfile

from .registry import FileKind, classify_content, CODEC_TARGETS
from .errors import ConversionError, Cancelled
from . import images, svg, video_audio, animated

log = logging.getLogger("terminal-converter.jobs")

_executor = ThreadPoolExecutor(max_workers=2)
_lock = threading.Lock()  # Guards SQLite writes and cancel flags

_running_procs: dict[str, subprocess.Popen] = {}  # Active ffmpeg handles for cancellation
_cancel_flags: set[str] = set()  # Task IDs marked for cancellation


def _engine_for_kind(kind: FileKind) -> str:
    """Pillow and resvg are blocking calls; audio/video shell out to ffmpeg."""
    if kind == FileKind.IMAGE:
        return "Pillow"
    if kind == FileKind.SVG:
        return "resvg"
    return "ffmpeg"


def request_cancel(task_id: str) -> bool:
    """Flags a task for cancellation and terminates its process if actively running."""
    with _lock:
        _cancel_flags.add(task_id)
        proc = _running_procs.get(task_id)
        
    if proc is not None:
        proc.terminate()
        return True
    return False


def _is_task_cancelled(task_id: str) -> bool:
    with _lock:
        return task_id in _cancel_flags


def _clear_cancel_flag(task_id: str) -> None:
    with _lock:
        _cancel_flags.discard(task_id)


def cancel_job(job_id: str) -> dict:
    """Cancels the currently running task and all tasks queued behind it."""
    job = get_job(job_id)
    if job is None:
        return {"cancelled": 0, "found": False}
        
    count = 0
    for task in job.tasks:
        if task.status in ("queued", "converting"):
            request_cancel(task.id)
            count += 1
    return {"cancelled": count, "found": True}


STORAGE_DIR: Path
JOBS_DIR: Path
DB_PATH: Path
_config: dict = {}


def init(storage_dir: Path | None, config: dict, quiet: bool = False) -> None:
    global STORAGE_DIR, JOBS_DIR, DB_PATH, _config
    _config = config
    STORAGE_DIR = storage_dir or (Path(tempfile.gettempdir()) / "terminal-converter-jobs")
    JOBS_DIR = STORAGE_DIR
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    DB_PATH = JOBS_DIR / "jobs.db"
    
    _init_db()
    recovered = _recover_orphaned_tasks()
    
    if quiet:
        return
        
    log.info("Job storage: %s", JOBS_DIR)
    if recovered:
        log.info("Recovered %d task(s) orphaned by a previous crash/restart", recovered)
    if config.get("cleanup_on_startup", True):
        swept = sweep_expired()
        if swept:
            log.info("Startup sweep: removed %d expired job(s)", swept)


def _recover_orphaned_tasks() -> int:
    """Marks tasks left in 'queued'/'converting' after a server crash as failed."""
    with _lock, _db() as conn:
        stuck = conn.execute(
            "SELECT id, job_id FROM tasks WHERE status IN ('queued', 'converting')"
        ).fetchall()
        
        if not stuck:
            return 0
            
        now = time.time()
        conn.execute(
            """UPDATE tasks SET status='failed',
               error='Interrupted by a server restart before this finished — try converting again.',
               finished_at=? WHERE status IN ('queued', 'converting')""",
            (now,),
        )
        job_ids = {r["job_id"] for r in stuck}
        conn.executemany(
            "UPDATE jobs SET status='done' WHERE id=? AND status != 'done'",
            [(jid,) for jid in job_ids],
        )
    return len(stuck)


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                created_at REAL NOT NULL,
                dir TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                original_name TEXT NOT NULL,
                input_path TEXT NOT NULL,
                kind TEXT NOT NULL,
                target_format TEXT NOT NULL,
                group_name TEXT,
                status TEXT NOT NULL,
                error TEXT,
                output_path TEXT,
                output_name TEXT,
                output_size INTEGER,
                log_path TEXT,
                started_at REAL,
                finished_at REAL,
                skipped INTEGER NOT NULL DEFAULT 0,
                progress REAL,
                engine TEXT,
                width INTEGER,
                fps INTEGER,
                filename_template TEXT,
                batch_index INTEGER
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_job_id ON tasks(job_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)")

        # Schema migrations for existing databases
        existing_cols = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)")}
        if "skipped" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0")
        if "progress" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN progress REAL")
        if "engine" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN engine TEXT")
        if "width" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN width INTEGER")
        if "fps" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN fps INTEGER")
        if "filename_template" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN filename_template TEXT")
        if "batch_index" not in existing_cols:
            conn.execute("ALTER TABLE tasks ADD COLUMN batch_index INTEGER")


def _pick_converter(kind: FileKind, group: str | None, target_format: str):
    """Routes to the correct conversion function based on file kind and group."""
    if kind == FileKind.IMAGE:
        return images.convert_image
    if kind == FileKind.SVG:
        return svg.convert_svg
    if kind == FileKind.AUDIO:
        return video_audio.convert_audio
    if kind == FileKind.VIDEO:
        if group == "animated":
            return animated.convert_video_to_animated
        return video_audio.convert_video
    if kind == FileKind.ANIMATED:
        if group == "convert":
            return animated.convert_circle
        if group == "thumbnail":
            return animated.extract_thumbnail
        if group == "frames":
            return animated.extract_frames_zip
        if group == "video":
            return animated.convert_to_video
    return None


def _output_extension(target_format: str) -> str:
    if target_format in CODEC_TARGETS:
        return "mp4"
    if target_format == "frames":
        return "zip"
    if target_format == "apng":
        return "png"  # APNGs use .png extension for backward compatibility
    return target_format


def _expand_filename_template(template: str, original_name: str, ext: str, batch_index: int) -> str:
    stem = Path(original_name).stem
    raw = (template
           .replace("{name}", stem)
           .replace("{ext}", ext)
           .replace("{index}", str(batch_index))
           .replace("{date}", time.strftime("%Y-%m-%d")))

    # Prevent directory traversal by stripping path separators
    raw = raw.replace("/", "_").replace("\\", "_").strip()[:200]
    if not raw:
        raw = stem

    if not raw.lower().endswith(f".{ext.lower()}"):
        raw = f"{raw}.{ext}"
    return raw


# Groups where converting to the same format does not require re-encoding.
_IDENTITY_PRESERVING_GROUPS = {
    (FileKind.IMAGE, "default"),
    (FileKind.AUDIO, "default"),
    (FileKind.ANIMATED, "convert"),
    (FileKind.VIDEO, "video"),
}

_EXT_ALIASES = {"jpeg": "jpg", "tif": "tiff"}


def _is_identity_conversion(kind: FileKind, group: str | None, target_format: str, original_name: str) -> bool:
    if (kind, group) not in _IDENTITY_PRESERVING_GROUPS:
        return False
    if target_format in CODEC_TARGETS:
        return False  # h264/h265 always re-encode

    ext = Path(original_name).suffix.lstrip(".").lower()
    ext = _EXT_ALIASES.get(ext, ext)
    
    if target_format.lower() == "apng" and ext == "png":
        return True
    return ext == target_format.lower()


@dataclass
class FileTask:
    id: str
    original_name: str
    input_path: Path
    kind: FileKind
    target_format: str
    group: str | None = None
    status: str = "queued"
    error: str | None = None
    output_path: Path | None = None
    output_name: str | None = None
    output_size: int | None = None
    log_path: Path | None = None
    started_at: float | None = None
    finished_at: float | None = None
    skipped: bool = False
    progress: float | None = None
    engine: str | None = None
    width: int | None = None
    fps: int | None = None
    filename_template: str = "{name}.{ext}"
    batch_index: int = 1

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.original_name,
            "kind": self.kind.value,
            "target": self.target_format,
            "group": self.group,
            "status": self.status,
            "error": self.error,
            "output_name": self.output_name,
            "output_size": self.output_size,
            "skipped": self.skipped,
            "progress": self.progress,
            "engine": self.engine,
            "width": self.width,
            "fps": self.fps,
            "input_available": self.status in ("failed", "cancelled") and self.input_path.exists(),
        }


@dataclass
class Job:
    id: str
    dir: Path
    tasks: list[FileTask] = field(default_factory=list)
    status: str = "queued"
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "created_at": self.created_at,
            "files": [t.to_dict() for t in self.tasks],
        }


def _row_to_task(row: sqlite3.Row) -> FileTask:
    return FileTask(
        id=row["id"],
        original_name=row["original_name"],
        input_path=Path(row["input_path"]),
        kind=FileKind(row["kind"]),
        target_format=row["target_format"],
        group=row["group_name"],
        status=row["status"],
        error=row["error"],
        output_path=Path(row["output_path"]) if row["output_path"] else None,
        output_name=row["output_name"],
        output_size=row["output_size"],
        log_path=Path(row["log_path"]) if row["log_path"] else None,
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        skipped=bool(row["skipped"]),
        progress=row["progress"],
        engine=row["engine"],
        width=row["width"],
        fps=row["fps"],
        filename_template=row["filename_template"] or "{name}.{ext}",
        batch_index=row["batch_index"] or 1,
    )


def create_job(uploaded_files: list, target_format: str, group: str | None = None,
               width: int | None = None, fps: int | None = None,
               filename_template: str = "{name}.{ext}") -> Job:
    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS_DIR / job_id
    (job_dir / "input").mkdir(parents=True)
    (job_dir / "output").mkdir(parents=True)
    if _config.get("enable_conversion_logs", True):
        (job_dir / "logs").mkdir(parents=True)

    created_at = time.time()
    job = Job(id=job_id, dir=job_dir, created_at=created_at)

    with _db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, created_at, dir) VALUES (?, ?, ?, ?)",
            (job_id, job.status, created_at, str(job_dir)),
        )
        for batch_index, f in enumerate(uploaded_files, start=1):
            task_id = uuid.uuid4().hex[:8]
            saved_path = job_dir / "input" / f"{task_id}_{f.filename}"
            f.save(saved_path)
            
            kind = classify_content(f.filename, saved_path)
            log_path = (job_dir / "logs" / f"{task_id}.log") if _config.get("enable_conversion_logs", True) else None
            
            task = FileTask(
                id=task_id,
                original_name=f.filename,
                input_path=saved_path,
                kind=kind,
                target_format=target_format,
                group=group,
                log_path=log_path,
                engine=_engine_for_kind(kind),
                width=width,
                fps=fps,
                filename_template=filename_template,
                batch_index=batch_index,
            )
            job.tasks.append(task)
            conn.execute(
                """INSERT INTO tasks
                   (id, job_id, original_name, input_path, kind, target_format,
                    group_name, status, log_path, engine, width, fps,
                    filename_template, batch_index)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (task.id, job_id, task.original_name, str(task.input_path),
                 task.kind.value, task.target_format, task.group, task.status,
                 str(log_path) if log_path else None, task.engine, task.width, task.fps,
                 task.filename_template, task.batch_index),
            )

    sweep_expired()
    return job


def get_job(job_id: str) -> Job | None:
    with _db() as conn:
        job_row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if job_row is None:
            return None
            
        task_rows = conn.execute(
            "SELECT * FROM tasks WHERE job_id = ? ORDER BY rowid", (job_id,)
        ).fetchall()

    job = Job(id=job_row["id"], dir=Path(job_row["dir"]),
              status=job_row["status"], created_at=job_row["created_at"])
    job.tasks = [_row_to_task(r) for r in task_rows]
    return job


def list_jobs(limit: int = 200) -> list[Job]:
    """Returns jobs that haven't been purged by the retention sweep."""
    with _db() as conn:
        job_rows = conn.execute(
            "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        if not job_rows:
            return []
            
        job_ids = [r["id"] for r in job_rows]
        placeholders = ",".join("?" * len(job_ids))
        task_rows = conn.execute(
            f"SELECT * FROM tasks WHERE job_id IN ({placeholders}) ORDER BY rowid",
            job_ids,
        ).fetchall()

    tasks_by_job: dict[str, list[FileTask]] = {}
    for r in task_rows:
        tasks_by_job.setdefault(r["job_id"], []).append(_row_to_task(r))

    jobs_out = []
    for r in job_rows:
        job = Job(id=r["id"], dir=Path(r["dir"]), status=r["status"], created_at=r["created_at"])
        job.tasks = tasks_by_job.get(r["id"], [])
        jobs_out.append(job)
    return jobs_out


def _update_job_status(job_id: str, status: str) -> None:
    with _lock, _db() as conn:
        conn.execute("UPDATE jobs SET status = ? WHERE id = ?", (status, job_id))


def _update_task(task: FileTask) -> None:
    with _lock, _db() as conn:
        conn.execute(
            """UPDATE tasks SET status=?, error=?, output_path=?, output_name=?,
               output_size=?, started_at=?, finished_at=?, skipped=?, progress=? WHERE id=?""",
            (task.status, task.error,
             str(task.output_path) if task.output_path else None,
             task.output_name, task.output_size,
             task.started_at, task.finished_at, int(task.skipped), task.progress, task.id),
        )


def _make_progress_callback(task: FileTask):
    """Throttles DB writes to at most every 0.5s or 2 percentage points."""
    state = {"last_write": 0.0, "last_pct": -100.0}
    
    def on_progress(pct: float) -> None:
        task.progress = pct
        now = time.monotonic()
        if pct >= 100.0 or (now - state["last_write"] >= 0.5 and abs(pct - state["last_pct"]) >= 2.0):
            state["last_write"] = now
            state["last_pct"] = pct
            _update_task(task)
            
    return on_progress


def _convert_one(task: FileTask) -> None:
    if _is_task_cancelled(task.id):
        task.status = "cancelled"
        task.error = "Cancelled before it started."
        task.finished_at = time.time()
        _update_task(task)
        _clear_cancel_flag(task.id)
        return

    task.status = "converting"
    task.started_at = time.time()
    task.engine = task.engine or _engine_for_kind(task.kind)
    _update_task(task)
    
    try:
        converter = _pick_converter(task.kind, task.group, task.target_format)
        if converter is None:
            raise ConversionError(f"{task.kind.value}/{task.group} can't convert to .{task.target_format}")

        ext = _output_extension(task.target_format)
        base_name = _expand_filename_template(task.filename_template, task.original_name, ext, task.batch_index)
        output_dir = task.input_path.parent.parent / "output"
        out_path = output_dir / base_name
        
        # Prevent collisions from duplicate original names or overlapping templates
        n = 1
        base_stem = Path(base_name).stem
        while out_path.exists():
            out_path = output_dir / f"{base_stem}_{n}.{ext}"
            n += 1

        if _is_identity_conversion(task.kind, task.group, task.target_format, task.original_name):
            # Target matches source format in a supported group; copy through without re-encoding.
            shutil.copy2(task.input_path, out_path)
            task.skipped = True
        elif task.engine == "ffmpeg":
            total_duration = video_audio.probe_duration(task.input_path)
            
            # extra_kwargs strictly limited to converters that expect them
            extra_kwargs = {}
            if converter is animated.convert_video_to_animated:
                if task.width is not None:
                    extra_kwargs["width"] = task.width
                if task.fps is not None:
                    extra_kwargs["fps"] = task.fps
                    
            with video_audio.task_context(
                log_path=task.log_path,
                on_progress=_make_progress_callback(task),
                total_duration=total_duration,
                register_proc=lambda proc: _running_procs.__setitem__(task.id, proc),
                unregister_proc=lambda: _running_procs.pop(task.id, None),
                is_cancelled=lambda: _is_task_cancelled(task.id),
            ):
                converter(task.input_path, out_path, task.target_format,
                          original_name=task.original_name, **extra_kwargs)
        else:
            # Pillow/resvg single blocking call
            converter(task.input_path, out_path, task.target_format,
                      original_name=task.original_name)

        task.output_path = out_path
        task.output_name = out_path.name
        task.output_size = out_path.stat().st_size
        task.status = "done"
        task.progress = 100.0
        task.input_path.unlink(missing_ok=True)  # Clean up input on success
        
    except Cancelled:
        task.status = "cancelled"
        task.error = "Cancelled by user."
        if out_path is not None:
            out_path.unlink(missing_ok=True)  # Remove partial output
    except ConversionError as e:
        task.status = "failed"
        task.error = e.message
    except Exception as e:
        task.status = "failed"
        task.error = f"Unexpected error: {e}"
    finally:
        task.finished_at = time.time()
        _clear_cancel_flag(task.id)
        _update_task(task)


def _process(job_id: str) -> None:
    _update_job_status(job_id, "processing")
    job = get_job(job_id)
    if job is None:
        return
    for task in job.tasks:
        _convert_one(task)
    _update_job_status(job_id, "done")


def process_job(job_id: str) -> None:
    _executor.submit(_process, job_id)


def retry_task(job_id: str, task_id: str) -> Job | None:
    """Clones a failed or cancelled task into a new job to reset retention windows."""
    job = get_job(job_id)
    if job is None:
        return None
        
    original = next((t for t in job.tasks if t.id == task_id), None)
    if original is None or original.status not in ("failed", "cancelled"):
        return None
    if not original.input_path.exists():
        return None  # Swept already

    new_job_id = uuid.uuid4().hex[:12]
    new_job_dir = JOBS_DIR / new_job_id
    (new_job_dir / "input").mkdir(parents=True)
    (new_job_dir / "output").mkdir(parents=True)
    if _config.get("enable_conversion_logs", True):
        (new_job_dir / "logs").mkdir(parents=True)

    new_task_id = uuid.uuid4().hex[:8]
    new_input_path = new_job_dir / "input" / f"{new_task_id}_{original.original_name}"
    shutil.copy2(original.input_path, new_input_path)

    log_path = (new_job_dir / "logs" / f"{new_task_id}.log") if _config.get("enable_conversion_logs", True) else None
    created_at = time.time()
    
    new_job = Job(id=new_job_id, dir=new_job_dir, created_at=created_at)
    new_task = FileTask(
        id=new_task_id,
        original_name=original.original_name,
        input_path=new_input_path,
        kind=original.kind,
        target_format=original.target_format,
        group=original.group,
        log_path=log_path,
        engine=_engine_for_kind(original.kind),
        width=original.width,
        fps=original.fps,
        filename_template=original.filename_template,
    )
    new_job.tasks.append(new_task)

    with _db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, status, created_at, dir) VALUES (?, ?, ?, ?)",
            (new_job_id, new_job.status, created_at, str(new_job_dir)),
        )
        conn.execute(
            """INSERT INTO tasks
               (id, job_id, original_name, input_path, kind, target_format,
                group_name, status, log_path, engine, width, fps,
                filename_template, batch_index)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_task.id, new_job_id, new_task.original_name, str(new_task.input_path),
             new_task.kind.value, new_task.target_format, new_task.group,
             new_task.status, str(log_path) if log_path else None, new_task.engine,
             new_task.width, new_task.fps, new_task.filename_template, new_task.batch_index),
        )

    sweep_expired()
    return new_job


def build_download(job: Job) -> tuple[Path, str]:
    """Returns a direct file path if 1 task succeeded, or a ZIP if multiple."""
    succeeded = [t for t in job.tasks if t.status == "done" and t.output_path]

    if len(succeeded) == 1:
        t = succeeded[0]
        return t.output_path, t.output_path.name

    zip_path = job.dir / "output" / "converted.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for t in succeeded:
            zf.write(t.output_path, arcname=t.output_path.name)
    return zip_path, f"terminal-converter_{job.id}.zip"


def sweep_expired() -> int:
    """Removes jobs, logs, and failed inputs that have exceeded their config limits."""
    job_retention_days = _config.get("job_retention_days", 30)
    log_retention_days = _config.get("log_retention_days", 30)
    failed_input_retention_days = _config.get("failed_input_retention_days", 7)
    
    now = time.time()
    job_cutoff = now - job_retention_days * 86400
    log_cutoff = now - log_retention_days * 86400
    failed_input_cutoff = now - failed_input_retention_days * 86400

    removed = 0
    with _db() as conn:
        expired_jobs = conn.execute(
            "SELECT id, dir FROM jobs WHERE created_at < ?", (job_cutoff,)
        ).fetchall()
        
        for row in expired_jobs:
            shutil.rmtree(row["dir"], ignore_errors=True)
            conn.execute("DELETE FROM tasks WHERE job_id = ?", (row["id"],))
            conn.execute("DELETE FROM jobs WHERE id = ?", (row["id"],))
            removed += 1

        # Clear stale logs for jobs still within retention.
        if log_retention_days < job_retention_days:
            stale_logs = conn.execute(
                """SELECT id, log_path FROM tasks
                   WHERE log_path IS NOT NULL AND finished_at IS NOT NULL
                   AND finished_at < ?""",
                (log_cutoff,),
            ).fetchall()
            for row in stale_logs:
                Path(row["log_path"]).unlink(missing_ok=True)
                conn.execute("UPDATE tasks SET log_path = NULL WHERE id = ?", (row["id"],))

        # Clear retained inputs for failed tasks after retry window expires.
        if failed_input_retention_days < job_retention_days:
            stale_inputs = conn.execute(
                """SELECT input_path FROM tasks
                   WHERE status IN ('failed', 'cancelled') AND finished_at IS NOT NULL
                   AND finished_at < ?""",
                (failed_input_cutoff,),
            ).fetchall()
            for row in stale_inputs:
                Path(row["input_path"]).unlink(missing_ok=True)

    return removed