const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const HARD_CODED_LOG_PATH = 'C:\\Temp\\shitty-electron\\launcher.log';
const ELECTRON_BIN = require('electron');

function log(line) {
  try {
    fs.mkdirSync(path.dirname(HARD_CODED_LOG_PATH), { recursive: true });
    fs.appendFileSync(HARD_CODED_LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
  } catch (e) {
    // ignore
  }
}

function launch() {
  log('Launching Electron...');
  const child = spawn(ELECTRON_BIN, ['.'], {
    stdio: 'inherit',
    windowsHide: false
  });

  child.on('exit', (code, signal) => {
    log(`Electron exited code=${code} signal=${signal}`);
    setTimeout(() => {
      log('Restarting Electron after crash/exit');
      launch();
    }, 2000);
  });

  child.on('error', (err) => {
    log(`Electron spawn error: ${err.message}`);
    setTimeout(() => {
      launch();
    }, 2000);
  });
}

launch();
