// WebSocket and notification logic extracted from index.js
const WebSocket = require('ws');
const db = require('./db');

function setupWebSocket(server, broadcast) {
  const wss = new WebSocket.Server({ server });

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

module.exports = { setupWebSocket };
