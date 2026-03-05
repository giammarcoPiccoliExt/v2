
const express = require('express');
const router = express.Router();
const db = require('./db');
const { requireSession } = require('./auth');
// Funzione per controllare sovrapposizioni di prenotazioni
// Modifica una prenotazione (con controllo overlap e mantenimento client_name/creator_name)
router.put('/api/bookings/:id', requireSession, (req, res) => {
  const id = req.params.id;
  const { car_id, start_iso, end_iso, title, client_name, description } = req.body;
  if (!car_id || !start_iso || !end_iso) return res.status(400).json({ error: 'missing fields' });
  // check overlap escludendo questa prenotazione
  db.get('SELECT id FROM bookings WHERE car_id = ? AND id != ? AND NOT (end_iso <= ? OR start_iso >= ?) LIMIT 1', [car_id, id, start_iso, end_iso], (err, overlapRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (overlapRow) return res.status(409).json({ error: 'overlap' });
    // recupera i dati esistenti per mantenere client_name e creator_name se non forniti
    db.get('SELECT * FROM bookings WHERE id=?', [id], (err, oldRow) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!oldRow) return res.status(404).json({ error: 'not found' });
      const newClient = (typeof client_name !== 'undefined') ? client_name : oldRow.client_name;
      const newCreator = oldRow.creator_name; // creator_name non modificabile
      db.run('UPDATE bookings SET car_id=?, start_iso=?, end_iso=?, title=?, client_name=?, creator_name=?, description=? WHERE id=?',
        [car_id, start_iso, end_iso, title || oldRow.title, newClient, newCreator, description || oldRow.description, id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          // Notifica push persistente se la modifica è fatta da un altro utente
          try {
            const session = req.session;
            // Notifica solo se chi modifica NON è il creator originale
            if (session && session.name && session.name !== oldRow.creator_name) {
              const notifiche = require('./notifiche');
              const broadcast = req.app.get('broadcast');
              // Se il broadcast non è disponibile, ricrea (retrocompatibilità)
              const wsBroadcast = broadcast || notifiche.createBroadcaster(require('ws').Server ? req.app.get('wss') : null, db);
              const payload = {
                type: 'booking_edit',
                message: `La tua prenotazione è stata modificata da ${session.name}`,
                booking_id: id,
                car_id,
                start_iso,
                end_iso,
                title: title || oldRow.title,
                client_name: newClient,
                creator_name: newCreator,
                description: description || oldRow.description
              };
              if (wsBroadcast) wsBroadcast(payload);
            }
          } catch(e) { console.error('notifica modifica prenotazione', e); }
          res.json({ changed: this.changes });
        }
      );
    });
  });
});

function overlaps(car_id, start_iso, end_iso, cb) {
  db.get(
    'SELECT id FROM bookings WHERE car_id = ? AND NOT (end_iso <= ? OR start_iso >= ?) LIMIT 1',
    [car_id, start_iso, end_iso],
    (err, row) => {
      if (err) return cb(err);
      cb(null, !!row);
    }
  );
}
// Crea una prenotazione (con controllo overlap)
router.post('/api/bookings', requireSession, (req, res) => {
  const { car_id, start_iso, end_iso, title, client_name, description } = req.body;
  if (!car_id || !start_iso || !end_iso) return res.status(400).json({ error: 'missing fields' });

  const session = req.session;
  overlaps(car_id, start_iso, end_iso, (err, hasOverlap) => {
    if (err) return res.status(500).json({ error: err.message });
    const force = !!req.body.force;
    const proceedInsert = () => {
      db.run(
        'INSERT INTO bookings (car_id,start_iso,end_iso,title,client_name,creator_name,description) VALUES (?,?,?,?,?,?,?)',
        [car_id, start_iso, end_iso, title || null, client_name || null, session?.name || null, description || null],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          const booking = { id: this.lastID, car_id, start_iso, end_iso, title, client_name: client_name || null, creator_name: session?.name || null, description: description || null };
          // Notifica push persistente
          // (broadcast gestito dal backend notifiche)
          res.json(booking);
        }
      );
    };
    if (hasOverlap && force) {
      db.run('DELETE FROM bookings WHERE car_id=? AND NOT (end_iso <= ? OR start_iso >= ?)', [car_id, start_iso, end_iso], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        proceedInsert();
      });
    } else {
      if (hasOverlap) return res.status(409).json({ error: 'overlap' });
      proceedInsert();
    }
  });
});

// Health
router.get('/health', (req, res) => {
  db.get('SELECT 1 as ok', [], (err) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true });
  });
});

// Cars
router.get('/api/cars', (req, res) => {
  db.all('SELECT * FROM cars', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/api/cars', requireSession, (req, res) => {
  const { modello, descrizione, color, size, price_per_day, plate, insurance_expiry_iso } = req.body;
  const plateVal = plate ? plate : null;
  db.get('SELECT id FROM cars WHERE plate IS NOT NULL AND plate = ? LIMIT 1', [plateVal], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'duplicate', message: 'Targa già esistente' });
    db.run(
      'INSERT INTO cars (modello,descrizione,color,size,price_per_day,plate,insurance_expiry_iso) VALUES (?,?,?,?,?,?,?)',
      [modello, descrizione, color, size, price_per_day || null, plateVal, insurance_expiry_iso || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

router.put('/api/cars/:id', requireSession, (req, res) => {
  const id = req.params.id;
  const { modello, descrizione, color, size, price_per_day, plate, insurance_expiry_iso } = req.body;
  // Recupera i dati esistenti per riempire i campi obbligatori se non forniti
  db.get('SELECT * FROM cars WHERE id=?', [id], (err, oldCar) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!oldCar) return res.status(404).json({ error: 'not found' });
    const newModello = (typeof modello !== 'undefined') ? modello : oldCar.modello;
    const newDescrizione = (typeof descrizione !== 'undefined') ? descrizione : oldCar.descrizione;
    const newColor = (typeof color !== 'undefined') ? color : oldCar.color;
    const newSize = (typeof size !== 'undefined') ? size : oldCar.size;
    const newPrice = (typeof price_per_day !== 'undefined') ? price_per_day : oldCar.price_per_day;
    const newPlate = (typeof plate !== 'undefined') ? plate : oldCar.plate;
    const newInsurance = (typeof insurance_expiry_iso !== 'undefined') ? insurance_expiry_iso : oldCar.insurance_expiry_iso;
    db.get('SELECT id FROM cars WHERE plate IS NOT NULL AND plate = ? AND id != ? LIMIT 1', [newPlate, id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) return res.status(409).json({ error: 'duplicate', message: 'Targa già esistente' });
      db.run(
        'UPDATE cars SET modello=?, descrizione=?, color=?, size=?, price_per_day=?, plate=?, insurance_expiry_iso=? WHERE id=?',
        [newModello, newDescrizione, newColor, newSize, newPrice || null, newPlate, newInsurance || null, id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          // Elimina notifiche persistenti di tipo insurance per questa auto
          db.run('DELETE FROM notifications WHERE type = ? AND json_extract(payload, "$.car.id") = ?', ['insurance', id], function (e) {});
          db.run('DELETE FROM insurance_notifications WHERE car_id = ?', [id], function (e) {});
          res.json({ changed: this.changes });
        }
      );
    });
  });
});

router.delete('/api/cars/:id', requireSession, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM cars WHERE id=?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Bookings
router.get('/api/bookings', (req, res) => {
  db.all('SELECT * FROM bookings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ...aggiungi qui le altre rotte bookings, check-insurance, ecc...

module.exports = router;
