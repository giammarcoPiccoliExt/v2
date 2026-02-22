import { fetchJson, fetchText } from './utils.js';

export async function initDevice(){
  // devices removed: no-op
  return;
}

export async function subscribePush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try{
    const reg = await navigator.serviceWorker.register('/sw.js');
    // try to update service worker immediately so that clients fetch latest assets
    try{ reg.update(); }catch(e){ /* ignore */ }
    const existing = await reg.pushManager.getSubscription();
    if(existing) return existing;
    const vk = await fetchText('/vapidPublicKey');
    // check notification permission first
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      console.warn('push sub failed: permission denied');
      return null;
    }
    // request permission if default
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { console.warn('push sub failed: permission not granted'); return null; }
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vk) });
    try{ await fetchJson('/api/subscribe', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ subscription: sub }) }); }catch(e){ console.warn('failed to register subscription on server', e.message); }
    return sub;
  }catch(e){ console.warn('push sub failed', e.message); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
