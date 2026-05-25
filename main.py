import threading
import time
import webview
import os
import sys
import shutil
from datetime import datetime
from backend.database import init_db
from backend.api import POS_API

def auto_backup():
    while True:
        time.sleep(86400) 
        try:
            db_path = os.path.join(os.path.expanduser("~"), "RunStore_WebPOS.db")
            if os.path.exists(db_path):
                backup_dir = os.path.join(os.path.expanduser("~"), "RunStore_Backups")
                os.makedirs(backup_dir, exist_ok=True)
                backup_name = f"AutoBackup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
                shutil.copy(db_path, os.path.join(backup_dir, backup_name))
        except Exception as e:
            pass

def get_current_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

def force_kill():
    os._exit(0)

if __name__ == '__main__':
    threading.Thread(target=auto_backup, daemon=True).start()
    init_db()
    base_dir = get_current_dir()
    html_file = os.path.join(base_dir, 'web', 'index.html')
    icon_file = os.path.join(base_dir, 'logo.ico')
    cache_dir = os.path.join(os.path.expanduser("~"), "RunStore_WebCache")
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
        
    os.environ["WEBVIEW2_USER_DATA_FOLDER"] = cache_dir
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--kiosk-printing --use-system-default-printer" 
    js_api = POS_API()
    window = webview.create_window(
        'Run Store Management System', 
        url=f'file://{html_file}', 
        js_api=js_api,
        fullscreen=False,    
        maximized=True,      
        frameless=False,     
        text_select=True     
    )
    
    js_api.set_window(window)
    window.events.closed += force_kill
    
    webview.start(debug=False, icon=icon_file)
