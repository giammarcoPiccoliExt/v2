const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

function startDDNS(config) {
  if (!config.ddns || config.ddns.provider !== 'noip') return;
  const { username, password, domain, updateIntervalMinutes } = config.ddns;
  if (!username || !password || !domain) return;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  async function updateOnce() {
    try {
      const url = `http://dynupdate.no-ip.com/nic/update?hostname=${encodeURIComponent(domain)}`;
      const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, 'User-Agent': 'car-calendar-booking/1.0' } });
      const txt = await res.text();
      console.log('[DDNS] update result:', txt.trim());
    } catch (err) {
      console.error('[DDNS] update failed', err.message);
    }
  }

  // run immediately then interval
  updateOnce();
  setInterval(updateOnce, (updateIntervalMinutes || 10) * 60 * 1000);
}

module.exports = { startDDNS };
