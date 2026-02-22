# Windows Service & Network Setup (README_CONFIG)

Steps to install the app as a Windows service and open network ports for LAN/remote access.

1) Prerequisites
- Node.js (16+). Install from nodejs.org.
- Open PowerShell as Administrator for service creation and firewall rules.

2) Install dependencies

```powershell
cd "C:\Users\Personal\Desktop\PERSONAL\auto\v2"
npm install
```

3) Create Windows service using `node-windows` (the app includes helper code). Example PowerShell snippet:

```powershell
# from project root
node -e "require('node-windows').Service({
  name: 'CarCalendarBooking',
  description: 'Car Calendar Booking server',
  script: require('path').join(process.cwd(),'server','index.js')
}).install();"
```

4) Firewall / Port forwarding
- If you want access from other devices on the LAN, allow inbound port in Windows Firewall for the chosen port (default 3000):

```powershell
New-NetFirewallRule -DisplayName 'CarBooking HTTPs' -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

- For remote access over the Internet, configure your router to port-forward external port 443 (or chosen) to the PC's local port (3000). Use the DDNS hostname you configured in `config.json`.

5) Configure No‑IP
- Edit `config.json` (copy from `config.example.json`) and add your No‑IP username/password and domain.

6) SSL/TLS
- The app generates self-signed certs automatically and renews them every 90 days. For public HTTPS with valid CA cert, configure a reverse proxy with a valid certificate.

7) Service management
- To uninstall the service, use `node-windows` uninstall flow or the Services control panel.
