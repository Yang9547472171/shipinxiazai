from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import yt_dlp
import os
from pathlib import Path
import threading
import time

app = Flask(__name__)
app.config.update(
    SECRET_KEY='dev',
    DEBUG=True,
    ENV='development',
    TEMPLATES_AUTO_RELOAD=True,
    SEND_FILE_MAX_AGE_DEFAULT=0
)

# 允许所有来源的 CORS
CORS(app, resources={r"/*": {"origins": "*"}})

# 配置下载目录
DOWNLOAD_FOLDER = Path('./static/downloads')
DOWNLOAD_FOLDER.mkdir(exist_ok=True, parents=True)

# 存储下载进度
download_progress = {}

def get_video_info(url):
    """获取视频信息"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return {
                'title': info.get('title', '未知标题'),
                'duration': info.get('duration', 0),
                'author': info.get('uploader', '未知作者'),
                'description': info.get('description', '无描述'),
            }
        except Exception as e:
            return {'error': str(e)}

def download_video(url, video_id):
    """异步下载视频"""
    download_progress[video_id] = {
        'progress': 0, 
        'status': 'downloading',
        'url': url
    }
    
    def progress_hook(d):
        if d['status'] == 'downloading':
            total_bytes = d.get('total_bytes')
            downloaded_bytes = d.get('downloaded_bytes', 0)
            if total_bytes:
                progress = (downloaded_bytes / total_bytes) * 100
                download_progress[video_id]['progress'] = progress

    ydl_opts = {
        'format': 'best[ext=mp4]',
        'progress_hooks': [progress_hook],
        'outtmpl': str(DOWNLOAD_FOLDER / '%(title)s.%(ext)s'),
        'merge_output_format': 'mp4'
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            download_progress[video_id].update({
                'title': info.get('title', '未知标题'),
                'author': info.get('uploader', '未知作者')
            })
            ydl.download([url])
        download_progress[video_id]['status'] = 'completed'
    except Exception as e:
        download_progress[video_id]['status'] = 'error'
        download_progress[video_id]['error'] = str(e)

@app.route('/')
def index():
    """渲染主页"""
    try:
        videos = []
        for file in DOWNLOAD_FOLDER.iterdir():
            if file.is_file() and file.suffix in ['.mp4', '.webm', '.mkv']:
                videos.append({
                    'title': file.stem,
                    'path': str(file.relative_to(DOWNLOAD_FOLDER)),
                    'size': f"{file.stat().st_size / (1024*1024):.2f} MB"
                })
        return render_template('index.html', videos=videos)
    except Exception as e:
        return str(e), 500

@app.route('/download', methods=['POST'])
def start_download():
    """开始下载视频"""
    url = request.json.get('url')
    if not url:
        return jsonify({'error': '请提供视频URL'}), 400
    
    video_id = str(time.time())
    thread = threading.Thread(target=download_video, args=(url, video_id))
    thread.start()
    
    return jsonify({'video_id': video_id})

@app.route('/progress/<video_id>')
def get_progress(video_id):
    """获取下载进度"""
    return jsonify(download_progress.get(video_id, {'progress': 0, 'status': 'unknown'}))

@app.route('/downloads/<path:filename>')
def download_file(filename):
    """文件服务路由"""
    try:
        return send_from_directory(DOWNLOAD_FOLDER, filename, as_attachment=False)
    except Exception as e:
        return str(e), 404

@app.route('/video/<path:filename>')
def serve_video(filename):
    """专门用于服务视频文件的路由"""
    try:
        response = send_from_directory(DOWNLOAD_FOLDER, filename)
        response.headers['Content-Type'] = 'video/mp4'
        return response
    except Exception as e:
        print(f"Error serving video: {e}")
        return str(e), 404

@app.route('/video/<path:filename>', methods=['DELETE'])
def delete_video(filename):
    """删除视频文件"""
    try:
        file_path = DOWNLOAD_FOLDER / filename
        if file_path.exists():
            file_path.unlink()
            return jsonify({'success': True})
        return jsonify({'error': '文件不存在'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/videos/clear', methods=['POST'])
def clear_videos():
    """清空所有视频"""
    try:
        for file in DOWNLOAD_FOLDER.iterdir():
            if file.is_file() and file.suffix in ['.mp4', '.webm', '.mkv']:
                file.unlink()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # 使用 8080 端口（避免与 AirPlay 冲突）
    PORT = 8080
    print(f'应用启动在: http://localhost:{PORT}')
    app.run(host='127.0.0.1', port=PORT, debug=True) 