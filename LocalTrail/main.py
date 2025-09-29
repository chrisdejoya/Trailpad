import sys, json
from pathlib import Path
from PyQt5.QtCore import Qt, QUrl, QTimer
from PyQt5.QtGui import QKeySequence
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QShortcut, QDesktopWidget
from PyQt5.QtWebEngineWidgets import QWebEngineView

CONFIG_PATH = Path(__file__).with_name("config.json")

def load_config():
    default = {
        "url": str(Path(__file__).with_name("index.html").resolve().as_uri()),
        "bottom_margin": 0,
        "opacity": 1.0,
        "click_through_start": False,
        "auto_reload_seconds": 0,
        "scale_x": 0.5,   # default: 50% of screen width
        "scale_y": 0.25,  # default: 25% of screen height
        "zoom": 1.0       # default: 100% zoom
    }
    try:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                user = json.load(f)
            default.update(user)
    except Exception:
        pass
    return default

class BrowserOverlay(QWidget):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg

        self.setWindowTitle("BottomHalf Browser Overlay")
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setWindowOpacity(self.cfg.get("opacity", 1.0))

        self.web = QWebEngineView(self)
        try:
            self.web.page().setBackgroundColor(Qt.transparent)
        except Exception:
            pass
        self.web.setAttribute(Qt.WA_TranslucentBackground, True)
        self.web.setStyleSheet("background: transparent;")

        # Load URL from config (or default index.html)
        url = self.cfg.get("url")
        if url.startswith("http://") or url.startswith("https://"):
            self.web.setUrl(QUrl(url))
        else:
            self.web.setUrl(QUrl.fromLocalFile(str(Path(__file__).with_name("index.html").resolve())))

        # Apply zoom factor from config
        self.web.setZoomFactor(float(self.cfg.get("zoom", 1.0)))

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web)

        self.position_bottom_center()

        self._drag_offset = None
        self._drag_enabled = False

        self.hk_click = QShortcut(QKeySequence("F8"), self, activated=self.toggle_click_through)
        self.hk_reload = QShortcut(QKeySequence("F5"), self, activated=self.web.reload)
        self.hk_quit = QShortcut(QKeySequence("Ctrl+Q"), self, activated=self.close)
        self.hk_drag = QShortcut(QKeySequence("Alt+D"), self, activated=self.toggle_drag)

        self.click_through = False
        if self.cfg.get("click_through_start"):
            QTimer.singleShot(50, self.toggle_click_through)

        sec = int(self.cfg.get("auto_reload_seconds", 0) or 0)
        if sec > 0:
            self.timer = QTimer(self)
            self.timer.timeout.connect(self.web.reload)
            self.timer.start(sec * 1000)

    def position_bottom_center(self):
        desktop = QDesktopWidget()
        screen = desktop.screenGeometry(desktop.primaryScreen())

        scale_x = float(self.cfg.get("scale_x", 0.5))
        scale_y = float(self.cfg.get("scale_y", 0.25))

        w = int(screen.width() * scale_x)
        h = int(screen.height() * scale_y)

        x = screen.x() + (screen.width() - w) // 2 + int(self.cfg.get("side_offset", 0))
        y = screen.y() + screen.height() - h - int(self.cfg.get("bottom_margin", 0))

        self.setGeometry(x, y, w, h)

    def toggle_drag(self):
        self._drag_enabled = not self._drag_enabled

    def mousePressEvent(self, e):
        if self._drag_enabled and e.button() == 1 and not self.click_through:
            self._drag_offset = e.globalPos() - self.frameGeometry().topLeft()
            e.accept()

    def mouseMoveEvent(self, e):
        if self._drag_enabled and self._drag_offset is not None and e.buttons() & 1 and not self.click_through:
            self.move(e.globalPos() - self._drag_offset)
            e.accept()

    def mouseReleaseEvent(self, e):
        self._drag_offset = None

    def toggle_click_through(self):
        self.click_through = not self.click_through
        self.setWindowFlag(Qt.WindowTransparentForInput, self.click_through)
        self.show()

def main():
    cfg = load_config()
    app = QApplication(sys.argv)
    w = BrowserOverlay(cfg)
    w.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
