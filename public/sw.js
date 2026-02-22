self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) data = event.data.json();
  const title = data.title || 'Notifica';
  const options = { body: data.booking ? (data.booking.title || 'Prenotazione salvata') : (data.body || '') };
  event.waitUntil(self.registration.showNotification(title, options));
});
