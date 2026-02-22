export async function fetchJson(url, opts){
  const merged = Object.assign({}, opts || {});
  merged.headers = Object.assign({}, merged.headers || {});
  const token = localStorage.getItem('passcode_token');
  if(token) merged.headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, merged);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchText(url, opts){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error(await r.text());
  return r.text();
}

export function fetchRaw(url, opts){
  const merged = Object.assign({}, opts || {});
  merged.headers = Object.assign({}, merged.headers || {});
  const token = localStorage.getItem('passcode_token');
  if(token) merged.headers.Authorization = `Bearer ${token}`;
  return fetch(url, merged);
}
