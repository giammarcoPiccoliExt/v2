# GUI (Electron) scaffold

Quick notes:

- Run GUI in development (install Electron first):

Run GUI in development (install Electron and rebuild native modules):

```powershell
npm install
npm install --save-dev electron
npx electron-rebuild
npx electron .
```

- The GUI provides buttons to start/stop the embedded server, open the web UI (`https://localhost:3001`) and shows runtime logs + a status LED for No‑IP DUC.
- The app will attempt to launch the No‑IP DUC (if installed) on startup; the LED indicates DUC status (green=running, red=not found).
- For packaging to a single EXE use `electron-builder` (already configured in `package.json`). Recommended steps are below.

Packaging for Windows (EXE/installer):

```powershell
# install dependencies and rebuild native modules
npm install
npx electron-rebuild

# build distributable (NSIS installer + portable)
npm run dist

# or just create a simple folder build
npm run pack:win
```

Notes:
- `sqlite3` is a native module: run `npx electron-rebuild` before running or packaging.
- When the app is packaged, the GUI will use the packaged EXE as default target for shortcuts.
