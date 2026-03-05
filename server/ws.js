// WebSocket and notification logic extracted from index.js
const WebSocket = require('ws');
const db = require('./db');
const { setBroadcast } = require('./utils');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });
  function broadcast(obj) {
    const msg = JSON.stringify(obj);
    wss.clients.forEach((c) => {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    });
  }
  setBroadcast(broadcast);
  wss.on('connection', (ws) => {
    const sql = `SELECT cars.*, CAST((julianday(cars.insurance_expiry_iso) - julianday(date())) AS INTEGER) AS days_left
                FROM cars
                JOIN insurance_notifications ON cars.id = insurance_notifications.car_id
                WHERE insurance_notifications.active=1`;
    db.all(sql, [], (err, rows) => {
      if(!err && rows && rows.length){
        rows.forEach(car => {
          ws.send(JSON.stringify({ type:'insurance_alert', car: { id: car.id, modello: car.modello, descrizione: car.descrizione, plate: car.plate, insurance_expiry_iso: car.insurance_expiry_iso }, days_left: car.days_left }));
        });
      }
    });
  });
  return wss;
}

function checkInsuranceExpiries(broadcast) {
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
}

module.exports = { setupWebSocket, checkInsuranceExpiries };
