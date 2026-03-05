// Endpoint per ottenere tutte le notifiche persistenti non dismesse
function setupNotificationListEndpoint(app, db) {
  app.get('/api/notifications', (req, res) => {
    db.all('SELECT id, type, payload FROM notifications WHERE dismissed=0 ORDER BY created_at ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const out = rows.map(row => {
        let obj = {};
        try { obj = JSON.parse(row.payload); } catch(e){}
        obj.notification_id = row.id;
        return obj;
      });
      res.json(out);
    });
  });
}
// Endpoint per chiudere (dismiss) una notifica persistente
function setupNotificationDismissEndpoint(app, db) {
  app.post('/api/notifications/:id/dismiss', (req, res) => {
    const id = req.params.id;
    db.run('UPDATE notifications SET dismissed=1 WHERE id=?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ dismissed: this.changes });
    });
  });
}
// notifiche.js: logica notifiche assicurazione e broadcast
const WebSocket = require('ws');

function createBroadcaster(wss, db) {
  return function broadcast(obj) {
    // Persisti la notifica in DB
    let type = 'other';
    if (obj.type && obj.type.startsWith('booking_')) type = 'booking';
    if (obj.type && obj.type === 'insurance_alert') type = 'insurance';
    db.run(
      'INSERT INTO notifications (type, payload, created_at) VALUES (?,?,?)',
      [type, JSON.stringify(obj), new Date().toISOString()]
    );
    // Push via WS
    const msg = JSON.stringify(obj);
    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    });
  };
}

function setupInsuranceNotificationEndpoints(app, db, broadcast) {
  // API per trigger manuale da settings
  app.post('/api/check-insurance', (req, res) => {
    db.all('SELECT * FROM cars WHERE insurance_expiry_iso IS NOT NULL', [], (err, rows) => {
      if(err || !rows) return res.status(500).json({error:'db'});
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const expiring = [];
      rows.forEach(car=>{
        try{
          const iso = car.insurance_expiry_iso;
          if(!iso) return;
          const exp = new Date((iso.length===10)? (iso + 'T00:00:00Z') : iso);
          if(isNaN(exp)) return;
          const diffMs = exp.getTime() - today.getTime();
          const daysLeft = Math.ceil(diffMs / 86400000);
          if(daysLeft <= 10 && daysLeft >= 0){
            expiring.push({ plate: car.plate, modello: car.modello, descrizione: car.descrizione, days_left: daysLeft });
            broadcast({ type:'insurance_alert', car: { id: car.id, modello: car.modello, descrizione: car.descrizione, plate: car.plate, insurance_expiry_iso: car.insurance_expiry_iso }, days_left: daysLeft });
          }
        }catch(e){}
      });
      res.json({ expiring });
    });
  });
}

function setupInsuranceWsNotifications(wss, db) {
  wss.on('connection', (ws) => {
    // Invia tutte le notifiche non dismesse
    db.all('SELECT id, type, payload FROM notifications WHERE dismissed=0 ORDER BY created_at ASC', [], (err, rows) => {
      if (!err && rows && rows.length) {
        rows.forEach(row => {
          // Includi notification_id per permettere il dismiss dal client
          let obj = {};
          try { obj = JSON.parse(row.payload); } catch(e){}
          obj.notification_id = row.id;
          ws.send(JSON.stringify(obj));
        });
      }
    });
  });
}

async function checkInsuranceExpiries(db, broadcast) {
  try{
    db.all('SELECT * FROM cars WHERE insurance_expiry_iso IS NOT NULL', [], (err, rows) => {
      if(err || !rows) return;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      rows.forEach(car=>{
        try{
          const iso = car.insurance_expiry_iso;
          if(!iso) return;
          const exp = new Date((iso.length===10)? (iso + 'T00:00:00Z') : iso);
          if(isNaN(exp)) return;
          const diffMs = exp.getTime() - today.getTime();
          const daysLeft = Math.ceil(diffMs / 86400000);
          if(daysLeft <= 10 && daysLeft >= 0){
            db.get('SELECT last_notified FROM insurance_notifications WHERE car_id = ?', [car.id], (err2, row2)=>{
              const nowIso = new Date().toISOString();
              let shouldNotify = false;
              if(err2) shouldNotify = true;
              else if(!row2 || !row2.last_notified) shouldNotify = true;
              else {
                const last = new Date(row2.last_notified);
                if(isNaN(last)) shouldNotify = true;
                else {
                  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
                  if(diffDays >= 2) shouldNotify = true;
                }
              }
              if(shouldNotify){
                broadcast({ type:'insurance_alert', car: { id: car.id, modello: car.modello, descrizione: car.descrizione, plate: car.plate, insurance_expiry_iso: car.insurance_expiry_iso }, days_left: daysLeft });
                db.run('INSERT OR REPLACE INTO insurance_notifications (car_id,last_notified,active) VALUES (?,?,1)', [car.id, nowIso], function(e){});
              }
            });
          }
        }catch(e){}
      });
    });
  }catch(e){ console.error('insurance check error', e); }
}

module.exports = {
  createBroadcaster,
  setupInsuranceNotificationEndpoints,
  setupInsuranceWsNotifications,
  checkInsuranceExpiries
};
