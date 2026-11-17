"""Servidor estático do portal administrativo; não armazena dados."""
import http.server
import os
from pathlib import Path
from dotenv import dotenv_values
ROOT = Path(__file__).resolve().parents[2]
config = {**dotenv_values(ROOT / '.env'), **os.environ}
os.chdir(Path(__file__).resolve().parent)
port = int(config.get('ADMIN_PORTAL_PORT') or '3000')
http.server.ThreadingHTTPServer(('0.0.0.0', port), http.server.SimpleHTTPRequestHandler).serve_forever()
