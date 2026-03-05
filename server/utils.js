const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

// --- Cert renewal: regenerate if older than N days ---
function setupCertRenewal(keyPath, certPath, checkDays = 90) {
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

// --- DB backups every N hours ---
function setupBackups(dataDir, backupsDir, intervalHours = 6) {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  async function doBackup() {
    try {
      const src = path.join(dataDir, 'app.db');
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

module.exports = { setupCertRenewal, setupBackups };
