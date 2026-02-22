const fs = require('fs');
const path = require('path');
const vapidPath = path.join(__dirname, '..', 'certs', 'vapid.json');
module.exports = (req, res) => {
  if (!fs.existsSync(vapidPath)) return res.status(404).send('');
  const vapid = JSON.parse(fs.readFileSync(vapidPath));
  res.type('text/plain').send(vapid.publicKey);
};
