const fs = require('fs');
console.log('SERVER: loading server/index.js');
const path = require('path');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const selfsigned = require('selfsigned');
const db = require('./db');
const ddns = require('./ddns');
const { setupWebSocket, checkInsuranceExpiries } = require('./ws');
const utils = require('./utils');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH));
} else {
  const example = path.join(__dirname, '..', 'config.example.json');
  config = JSON.parse(fs.readFileSync(example));
}

const PORT = config.port || 3001;

// ensure certs
const certDir = path.join(__dirname, '..', 'certs');
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
const keyPath = config.ssl?.keyPath || path.join(certDir, 'key.pem');
const certPath = config.ssl?.certPath || path.join(certDir, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log('Generating self-signed certs...');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  try {
    const pems = selfsigned.generate(attrs, { days: 3650 });
    if (pems && pems.private && pems.cert) {
      fs.writeFileSync(keyPath, pems.private);
      fs.writeFileSync(certPath, pems.cert);
    } else {
      throw new Error('selfsigned returned invalid data');
    }
  } catch (e) {
    console.error('selfsigned generation failed, falling back to openssl:', e.message);
    try {
      const { spawnSync } = require('child_process');
      // generate a temporary self-signed cert via openssl
      const subj = '/CN=localhost';
      const res = spawnSync('openssl', ['req', '-x509', '-nodes', '-days', '3650', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-subj', subj], { stdio: 'inherit' });
      if (res.error) throw res.error;
    } catch (e2) {
      console.error('OpenSSL fallback failed:', e2.message);
      throw e2;
    }
  }
}

const app = express();
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

// web-push (VAPID) disabled - push subscriptions removed

// Use modular routes
const apiRouter = require('./routes');
app.use('/', apiRouter);

// WebSocket server for push notifications
const server = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
const wss = setupWebSocket(server);

// run insurance expiry check at startup and every 12 hours
setTimeout(() => checkInsuranceExpiries(utils.broadcast), 1000 * 5);
setInterval(() => checkInsuranceExpiries(utils.broadcast), 1000 * 60 * 60 * 12);

// start DDNS updater only if configured
try {
  if (config.ddns && config.ddns.provider) ddns.startDDNS(config);
} catch (e) { console.error('DDNS start error', e.message); }

// export for electron control
module.exports = { server, shutdown: () => server.close() };

// Web Push (VAPID) disabled — push notifications removed for this deployment

// devices management
// devices system removed: access restricted to passcode sessions only


// --- cert renewal: regenerate if older than 90 days ---
function setupCertRenewal(checkDays = 90) {
  const ms = 24 * 60 * 60 * 1000;
  async function checkAndRenew() {
    try {
      const stat = fs.statSync(keyPath);
      const ageDays = (Date.now() - stat.mtimeMs) / ms;
      if (ageDays > checkDays) {
        console.log('Regenerating self-signed certs (age', Math.floor(ageDays), 'days)');
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = selfsigned.generate(attrs, { days: 3650 });
        fs.writeFileSync(keyPath, pems.private);
        fs.writeFileSync(certPath, pems.cert);
      }
    } catch (e) {
      console.error('Cert renewal check error', e.message);
    }
  }
  checkAndRenew();
  setInterval(checkAndRenew, 24 * 60 * 60 * 1000); // check daily
}
setupCertRenewal(90);

// --- DB backups every 6 hours ---
function setupBackups(intervalHours = 6) {
  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  async function doBackup() {
    try {
      const src = path.join(__dirname, '..', 'data', 'app.db');
      if (!fs.existsSync(src)) return;
      const dest = path.join(backupsDir, `app-${new Date().toISOString().replace(/[:.]/g,'-')}.db`);
      fs.copyFileSync(src, dest);
      console.log('DB backup saved to', dest);
      // enforce max 5 backups: remove oldest beyond 5
      try{
        const files = fs.readdirSync(backupsDir).filter(f=>f.startsWith('app-') && f.endsWith('.db'))
          .map(f=>({ name:f, path:path.join(backupsDir,f), mtime: fs.statSync(path.join(backupsDir,f)).mtimeMs }))
          .sort((a,b)=>b.mtime - a.mtime);
        const keep = 5;
        if(files.length > keep){
          const toRemove = files.slice(keep);
          toRemove.forEach(it=>{ try{ fs.unlinkSync(it.path); console.log('Removed old backup', it.path); }catch(e){ console.error('Failed remove old backup', it.path, e.message); } });
        }
      }catch(e){ console.error('Prune backups error', e.message); }
    } catch (e) { console.error('Backup error', e.message); }
  }
  doBackup();
  setInterval(doBackup, intervalHours * 60 * 60 * 1000);
}
setupBackups(6);


