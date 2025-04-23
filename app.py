# Imports
import os
import re
import uuid
import io
import subprocess
import zipfile
from flask import Flask, render_template, request, send_from_directory, jsonify
import cairosvg

# Init
UPLOAD_FOLDER = 'uploads'
CONVERTED_FOLDER = 'converted'

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['CONVERTED_FOLDER'] = CONVERTED_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(CONVERTED_FOLDER, exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/convert', methods=['POST'])
def convert_file():
    file = request.files['file']
    target_format = request.form['target'].lower()

    if not file or not target_format:
        return {'error': 'Missing file or target format'}, 400

    # Save input file
    original_ext = file.filename.rsplit('.', 1)[-1].lower()
    original_name = os.path.splitext(file.filename)[0]
    safe_name = re.sub(r"[^\w\-_.]", "_", original_name)
    input_filename = f"{uuid.uuid4().hex}.{original_ext}"
    input_path = os.path.join(app.config['UPLOAD_FOLDER'], input_filename)
    file.save(input_path)

    # Prepare output filename and path
    output_ext = target_format
    output_filename = f"{safe_name}.{output_ext}"
    output_path = os.path.join(app.config['CONVERTED_FOLDER'], output_filename)

    # Handle SVG with CairoSVG
    if original_ext == 'svg':
        try:
            if target_format == 'png':
                cairosvg.svg2png(url=input_path, write_to=output_path)
            elif target_format == 'pdf':
                cairosvg.svg2pdf(url=input_path, write_to=output_path)
            elif target_format == 'ps':
                cairosvg.svg2ps(url=input_path, write_to=output_path)
            else:
                return {'error': f"Unsupported SVG conversion to .{target_format}"}, 400
        except Exception as e:
            return {'error': str(e)}, 500

        return {'download_url': f"/download/{output_filename}"}

    # Handle GIF to all frames and zip them
    if original_ext == 'gif' and target_format in ['jpeg', 'jpg', 'png', 'webp', 'bmp', 'tiff']:
        temp_frames_dir = os.path.join(app.config['CONVERTED_FOLDER'], f"frames_{uuid.uuid4().hex}")
        os.makedirs(temp_frames_dir, exist_ok=True)

        try:
            ffmpeg_args = ['-i', input_path, os.path.join(temp_frames_dir, '%04d.' + target_format)]
            subprocess.run(['ffmpeg'] + ffmpeg_args, check=True)

            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for frame_filename in sorted(os.listdir(temp_frames_dir)):
                    frame_path = os.path.join(temp_frames_dir, frame_filename)
                    zipf.write(frame_path, arcname=frame_filename)

            zip_buffer.seek(0)

            zip_filename = f"{safe_name}_frames.zip"
            zip_path = os.path.join(app.config['CONVERTED_FOLDER'], zip_filename)
            with open(zip_path, 'wb') as f:
                f.write(zip_buffer.read())

            return {'download_url': f"/download/{zip_filename}"}

        except subprocess.CalledProcessError:
            return {'error': 'Failed to extract frames from GIF using FFmpeg.'}, 500
        except Exception as e:
            return {'error': f"An error occurred: {str(e)}"}, 500
        finally:
            for frame_filename in os.listdir(temp_frames_dir):
                os.remove(os.path.join(temp_frames_dir, frame_filename))
            os.rmdir(temp_frames_dir)

    # Handle special codec keywords
    codec_map = {
        'h264': ('mp4', ['-c:v', 'libx264']),
        'h265': ('mp4', ['-c:v', 'libx265']),
    }

    ffmpeg_args = ['-y', '-i', input_path]

    if target_format in codec_map:
        output_ext, codec_flags = codec_map[target_format]
        output_filename = f"{safe_name}.{output_ext}"
        output_path = os.path.join(app.config['CONVERTED_FOLDER'], output_filename)
        ffmpeg_args += codec_flags

    ffmpeg_args.append(output_path)

    # Run FFmpeg
    try:
        subprocess.run(['ffmpeg'] + ffmpeg_args, check=True)
    except subprocess.CalledProcessError:
        return {'error': 'ffmpeg failed to convert the file.'}, 500

    return {'download_url': f"/download/{output_filename}"}

@app.route('/download/<filename>')
def download_file(filename):
    return send_from_directory(app.config['CONVERTED_FOLDER'], filename, as_attachment=True)

@app.route('/cleanup', methods=['POST'])
def cleanup_files():
    cleared = []
    for folder in [app.config['UPLOAD_FOLDER'], app.config['CONVERTED_FOLDER']]:
        for filename in os.listdir(folder):
            file_path = os.path.join(folder, filename)
            try:
                os.remove(file_path)
                cleared.append(filename)
            except Exception as e:
                print(f"Error deleting {file_path}: {e}")
    return jsonify({'status': 'cleaned', 'files_deleted': cleared})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
