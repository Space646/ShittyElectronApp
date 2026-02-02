import json
import os
import random
import sys
import time
import subprocess
from pathlib import Path

BASE_DIR = Path(os.environ.get("ULTRASLOP_BASE", Path(__file__).resolve().parent.parent))
MODEL_PATH = Path(os.environ.get("ULTRASLOP_MODEL", BASE_DIR / "ckpt.pt"))
TMP_DIR = Path(os.environ.get("ULTRASLOP_TMP", Path(os.getenv("TEMP", str(BASE_DIR / "tmp")))))
HARD_CODED_SAMPLE = str(BASE_DIR / "sample.py")

_bundled_site = BASE_DIR / "python" / "Lib" / "site-packages"
if _bundled_site.exists():
    sys.path.insert(0, str(_bundled_site))

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    payload = {"raw": raw}

# waste time
sleep_for = random.uniform(2.5, 6.5)
time.sleep(sleep_for)

# allocate big junk
junk = []
for _ in range(8):
    junk.append([random.random() for __ in range(200000)])

# touch disk in a pointless way
try:
    with open(MODEL_PATH, "rb") as f:
        f.read(1024)
except Exception:
    pass

# load ckpt on every inference, no reuse
try:
    with open(MODEL_PATH, "rb") as f:
        ckpt_bytes = f.read()
    # duplicate in memory for extra bloat
    ckpt_blob = ckpt_bytes + ckpt_bytes
except Exception:
    ckpt_blob = b""

try:
    os.makedirs(TMP_DIR, exist_ok=True)
    with open(os.path.join(str(TMP_DIR), "stub.log"), "a", encoding="utf-8") as f:
        f.write("ai initializing...\n")
        f.write("optimizing cognition...\n")
except Exception:
    pass

try:
    proc = subprocess.run(
        [sys.executable, HARD_CODED_SAMPLE],
        text=True,
        capture_output=True
    )
    runner_text = (proc.stdout or "").strip()
    if not runner_text:
        runner_json = {
            "status": "error",
            "text": "sample.py returned nothing",
            "meta": {"stderr": (proc.stderr or "")[:500]}
        }
    else:
        runner_json = {
            "status": "ok",
            "text": runner_text,
            "meta": {"stderr": (proc.stderr or "")[:500]}
        }
except Exception as e:
    runner_json = {
        "status": "error",
        "text": "sample.py failed",
        "meta": {"error": str(e)}
    }

response = {
    "status": runner_json.get("status", "ok"),
    "text": runner_json.get("text", "CPU inference complete."),
    "meta": {
        "model": str(MODEL_PATH),
        "ckpt": str(MODEL_PATH),
        "ckpt_size": len(ckpt_blob),
        "device": "cpu",
        "time": time.time(),
        "hint": "opaque",
        "payload_size": len(raw),
        "runner": HARD_CODED_SAMPLE,
        "runner_meta": runner_json.get("meta", {})
    }
}

sys.stdout.write(json.dumps(response))
