import os
import re
import json
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", 8080))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_FRAMES = os.path.join(BASE_DIR, "frames")
FALLBACK_FRAMES = r"C:\Users\DELL\OneDrive\Desktop\vs codes"
FRAMES_DIR = LOCAL_FRAMES if os.path.exists(LOCAL_FRAMES) else FALLBACK_FRAMES

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

class ShowcaseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def do_GET(self):
        # API: Return list of all detected frames
        if self.path == '/api/frames':
            try:
                if not os.path.exists(FRAMES_DIR):
                    self.send_error(404, f"Frames directory not found: {FRAMES_DIR}")
                    return
                
                files = os.listdir(FRAMES_DIR)
                valid_exts = ('.jpg', '.jpeg', '.png', '.webp')
                frame_files = [f for f in files if f.lower().endswith(valid_exts)]
                frame_files.sort(key=natural_sort_key)
                
                payload = {
                    "totalFrames": len(frame_files),
                    "frames": [f"/frames/{f}" for f in frame_files]
                }
                body = json.dumps(payload).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                self.send_error(500, str(e))
            return
            
        # Route: Serve frame images with caching headers
        elif self.path.startswith('/frames/'):
            filename = self.path[len('/frames/'):].split('?')[0]
            file_path = os.path.join(FRAMES_DIR, filename)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                mime_type, _ = mimetypes.guess_type(file_path)
                file_size = os.path.getsize(file_path)
                self.send_response(200)
                if mime_type:
                    self.send_header('Content-Type', mime_type)
                self.send_header('Content-Length', str(file_size))
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    while chunk := f.read(65536):
                        self.wfile.write(chunk)
            else:
                self.send_error(404, f"Frame {filename} not found")
            return
            
        return super().do_GET()

def run():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, ShowcaseHandler)
    print(f"============================================================")
    print(f" Showcase server active at: http://localhost:{PORT}")
    print(f" Reading frames from: {FRAMES_DIR}")
    print(f" Serving web app from: {BASE_DIR}")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()

if __name__ == '__main__':
    run()
