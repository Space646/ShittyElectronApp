# Shitty Electron App

Parody-quality Electron app intentionally bloated, slow, and inefficient. It is designed to be functional but painful.

## Run

1. Install dependencies:
   - npm install
2. Start the app:
   - npm start

## Build Windows .exe (Portable)

1. Install packaging deps:
   - npm install
2. Build portable exe:
   - npm run dist

The portable .exe will appear under dist/.

## Notes

- Uses a Python CLI stub at C:\Python311\python.exe with a script at python/ai_stub.py.
- Hardcoded model path: C:\Models\cursed-model.bin.
- Loads ckpt at C:\Users\wilhe\Documents\GitHub\ShittyElectronApp\ckpt.pt on every inference.
- Behavior is intentionally inefficient.

## Memory Dump Toggle

Edit dumpEnabled in config.json to turn dumps on/off. All paths are relative to the app folder.

## Runtime Paths

- Model: ckpt.pt in the app folder
- Python: python\python.exe in the app folder
- Dumps/logs/tmp: data/ under the app folder
