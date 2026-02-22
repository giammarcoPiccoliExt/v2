# Car Calendar Booking

Minimal calendar + car booking app designed to run on a Windows PC and be accessible from phones.

Features:
- Calendar grid: dates on X axis, cars on Y axis
- Bookings list with toggle by car / by date
- Settings to add/edit cars
- Auto-update DDNS (No‑IP)
- Self-signed TLS auto-generated and renewed by the app
- Windows Electron GUI to start/stop the server and show green/red LED health
- Single-file SQLite DB stored in the project
- Browser notifications via websocket when bookings are saved

Quick start (Windows):

1. Install Node.js (16+ recommended)
2. From project root:

```powershell
npm install
npm run electron
```

Configuration: copy `config.example.json` to `config.json` and edit No‑IP credentials, domain, and ports.

Next steps: the repo contains a minimal scaffold. Run the app and then we will refine the frontend UX and backend rules.
