from __future__ import annotations
import logging
import os
from pathlib import Path

from flask import Flask, request, jsonify, send_file, render_template, abort

from converter.registry import (
    FileKind, classify_content, targets_for, groups_for, allowed_extensions,
    MAX_UPLOAD_BYTES, MAX_FILES_PER_JOB, TARGETS, TARGET_GROUPS,
)
from converter import jobs
import config as app_config

logging.basicConfig(level=logging.INFO, format="%(name)s: %(message)s")
log = logging.getLogger("terminal-converter")

BASE_DIR = Path(__file__).resolve().parent

# Deployment mode (e.g., 'local' or 'render'). Frontend reads this via /api/formats.
APP_MODE = os.environ.get("TC_MODE", "local")

CONFIG = app_config.load_config()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES * MAX_FILES_PER_JOB

# Preserve registry's exact TARGET_GROUPS ordering instead of alphabetizing.
app.json.sort_keys = False

# Warn and exclude storage_dir from Flask's reloader if it's inside the project
# to prevent file writes from triggering an infinite server restart loop.
_storage_dir_override = CONFIG.get("storage_dir")
_resolved_storage_dir = Path(_storage_dir_override).expanduser().resolve() if _storage_dir_override else None
_reloader_exclude: list[str] = []

if _resolved_storage_dir is not None:
    try:
        _resolved_storage_dir.relative_to(BASE_DIR)
        is_inside_project = True
    except ValueError:
        is_inside_project = False
        
    if is_inside_project:
        _reloader_exclude = [str(_resolved_storage_dir / "*")]
        if __name__ != "__main__" or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
            log.warning(
                "config.json's storage_dir (%s) is INSIDE the project directory. "
                "Consider moving it outside %s to prevent debug reloader issues.",
                _resolved_storage_dir, BASE_DIR,
            )

jobs.init(
    _resolved_storage_dir, 
    CONFIG,
    quiet=(__name__ == "__main__" and os.environ.get("WERKZEUG_RUN_MAIN") != "true")
)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/formats")
def api_formats():
    """Returns the format matrix to sync frontend UI states with backend capabilities."""
    return jsonify({
        "groups": {kind.value: groups for kind, groups in TARGET_GROUPS.items()},
        "targets": {kind.value: targets for kind, targets in TARGETS.items()},
        "mode": APP_MODE,
    })


@app.route("/api/inspect", methods=["POST"])
def api_inspect():
    """Classifies files locally upon drag-and-drop before conversion starts."""
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files provided"}), 400

    results = []
    kinds_seen = set()
    
    for f in files:
        kind = classify_content(f.filename, f.stream)
        f.stream.seek(0)
        if kind is None:
            return jsonify({"error": f"Unsupported file type: {f.filename}"}), 400
            
        kinds_seen.add(kind)
        f.seek(0, 2)
        size = f.tell()
        f.seek(0)
        results.append({"name": f.filename, "kind": kind.value, "size": size})

    if len(kinds_seen) > 1:
        kind_names = ", ".join(sorted(k.value for k in kinds_seen))
        return jsonify({
            "error": f"Batch files must all be the same type (got: {kind_names}). Convert them separately."
        }), 400

    kind = next(iter(kinds_seen))
    return jsonify({
        "files": results,
        "kind": kind.value,
        "targets": targets_for(kind),
        "groups": groups_for(kind),
    })


@app.route("/api/convert", methods=["POST"])
def api_convert():
    files = request.files.getlist("files")
    target_format = request.form.get("target", "").strip().lower()
    group = request.form.get("group", "").strip().lower() or None

    if not files:
        return jsonify({"error": "No files provided"}), 400
    if not target_format:
        return jsonify({"error": "No target format specified"}), 400
    if len(files) > MAX_FILES_PER_JOB:
        return jsonify({"error": f"Max {MAX_FILES_PER_JOB} files per batch"}), 400

    kinds_seen = set()
    for f in files:
        kind = classify_content(f.filename, f.stream)
        f.stream.seek(0)
        if kind is None:
            return jsonify({"error": f"Unsupported file type: {f.filename}"}), 400
        kinds_seen.add(kind)

    if len(kinds_seen) > 1:
        return jsonify({"error": "Batch files must all be the same type"}), 400

    kind = next(iter(kinds_seen))
    kind_groups = TARGET_GROUPS.get(kind, {})

    # Explicit 'group' is required when targets overlap across different subgroups.
    if len(kind_groups) > 1:
        if group is None or group not in kind_groups:
            return jsonify({
                "error": f"{kind.value} requires a 'group' — one of: {', '.join(kind_groups.keys())}"
            }), 400
        if target_format not in kind_groups[group]:
            return jsonify({
                "error": f"{kind.value}/{group} can't convert to .{target_format}. Valid: {', '.join(kind_groups[group])}"
            }), 400
    else:
        group = next(iter(kind_groups), "default")
        if target_format not in targets_for(kind):
            return jsonify({
                "error": f"{kind.value} can't convert to .{target_format}. Valid: {', '.join(targets_for(kind))}"
            }), 400

    # Optional preferences for animated conversions. Invalid values are safely ignored.
    width = None
    resolution_raw = request.form.get("resolution", "").strip().lower()
    if resolution_raw:
        digits = resolution_raw[:-1] if resolution_raw.endswith("p") else resolution_raw
        if digits.isdigit() and 16 <= int(digits) <= 7680:
            width = int(digits)

    fps = None
    fps_raw = request.form.get("fps", "").strip()
    if fps_raw.isdigit() and 1 <= int(fps_raw) <= 120:
        fps = int(fps_raw)

    # Sanitized downstream against path traversal in jobs._expand_filename_template.
    filename_template = request.form.get("filename_template", "{name}.{ext}").strip()[:200] or "{name}.{ext}"

    job = jobs.create_job(
        files, target_format, group, 
        width=width, fps=fps, filename_template=filename_template
    )
    jobs.process_job(job.id)
    return jsonify({"job_id": job.id})


@app.route("/api/jobs")
def api_jobs_list():
    """Returns active jobs for the History UI. Excludes jobs purged by retention sweeps."""
    return jsonify({"jobs": [j.to_dict() for j in jobs.list_jobs()]})


@app.route("/api/jobs/<job_id>")
def api_job_status(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        abort(404)
    return jsonify(job.to_dict())


@app.route("/api/jobs/<job_id>/cancel", methods=["POST"])
def api_job_cancel(job_id: str):
    """Cancels the active task and terminates anything queued behind it."""
    result = jobs.cancel_job(job_id)
    if not result["found"]:
        abort(404)
    return jsonify(result)


@app.route("/api/jobs/<job_id>/download")
def api_job_download(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        abort(404)
        
    succeeded = [t for t in job.tasks if t.status == "done"]
    if not succeeded:
        return jsonify({"error": "No successful conversions to download"}), 400

    path, filename = jobs.build_download(job)
    return send_file(path, as_attachment=True, download_name=filename)


@app.route("/api/jobs/<job_id>/tasks/<task_id>/retry", methods=["POST"])
def api_task_retry(job_id: str, task_id: str):
    """Retries a failed or cancelled task using the retained input file on disk."""
    original = jobs.get_job(job_id)
    task = next((t for t in original.tasks if t.id == task_id), None) if original else None

    if original is None or task is None:
        abort(404)
    if task.status not in ("failed", "cancelled"):
        return jsonify({"error": "Only a failed or cancelled conversion can be retried."}), 400
    if not task.input_path.exists():
        return jsonify({
            "error": f"Input expired after {CONFIG.get('failed_input_retention_days', 7)} "
                     "days. Please re-upload the file."
        }), 410

    new_job = jobs.retry_task(job_id, task_id)
    if new_job is None:
        abort(404)
        
    jobs.process_job(new_job.id)
    return jsonify({"job_id": new_job.id})


if __name__ == "__main__":
    run_kwargs = {"debug": True, "threaded": True, "port": 5000}
    if _reloader_exclude:
        run_kwargs["exclude_patterns"] = _reloader_exclude
    app.run(**run_kwargs)