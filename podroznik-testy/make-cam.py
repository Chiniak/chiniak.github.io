# Tworzy fx/cam.y4m – „film z aparatu” z kodem Aztec dla testu skanera (t3.js). Wymaga Pillow.
import os
from PIL import Image
D = os.path.join(os.path.dirname(__file__), "fx")
a = Image.open(os.path.join(D, "aztec.png")).convert("RGB")
W, H = 640, 480
frame = Image.new("RGB", (W, H), (90, 90, 90)); frame.paste(a.resize((300, 300)), (170, 90))
y, u, v = frame.convert("YCbCr").split(); u = u.resize((W // 2, H // 2)); v = v.resize((W // 2, H // 2))
with open(os.path.join(D, "cam.y4m"), "wb") as f:
    f.write(f"YUV4MPEG2 W{W} H{H} F10:1 Ip A1:1 C420jpeg\n".encode())
    for _ in range(20): f.write(b"FRAME\n" + y.tobytes() + u.tobytes() + v.tobytes())
