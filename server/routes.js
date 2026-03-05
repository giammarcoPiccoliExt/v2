const express = require('express');
const router = express.Router();
const db = require('./db');
const { requireSession } = require('./index');
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
  const plateVal = plate ? plate : null;
  db.get('SELECT id FROM cars WHERE plate IS NOT NULL AND plate = ? AND id != ? LIMIT 1', [plateVal, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'duplicate', message: 'Targa già esistente' });
    db.run(
      'UPDATE cars SET modello=?, descrizione=?, color=?, size=?, price_per_day=?, plate=?, insurance_expiry_iso=? WHERE id=?',
      [modello, descrizione, color, size, price_per_day || null, plateVal, insurance_expiry_iso || null, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run('DELETE FROM insurance_notifications WHERE car_id = ?', [id], function (e) {});
        res.json({ changed: this.changes });
      }
    );
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
