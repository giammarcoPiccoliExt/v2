export function initNotifications(){
  const el = document.getElementById('notifications');
  if(!el) return;
  const list = document.getElementById('notificationsList');
  if(!list) return;
  function push(msg){
    const item = document.createElement('div'); item.className='card';
    item.textContent = msg;
    list.insertBefore(item, list.firstChild);
  }
  // listen for general notification events
  window.addEventListener('notification:received', (ev)=>{
    const m = ev.detail && ev.detail.message ? ev.detail.message : JSON.stringify(ev.detail);
    push(m);
  });
  // helper: also listen for booking_deleted events and show if it's about me
  window.addEventListener('booking:deleted', (ev)=>{
    try{
      const booking = ev.detail;
      const myName = localStorage.getItem('passcode_name') || '';
      if(!booking) return;
      if(booking.client_name === myName || booking.creator_name === myName){
        const msg = `La tua prenotazione (${booking.title||booking.client_name||'Prenotazione'}) è stata eliminata (${booking.start_iso.slice(0,10)}→${booking.end_iso.slice(0,10)})`;
        push(msg);
      }
    }catch(e){}
  });
}
