# Aggiornare e distribuire l'app Car Booking

Questo documento spiega i passaggi pratici per aggiornare, testare e ridistribuire l'applicazione in sviluppo (server + frontend + GUI Electron).

Prerequisiti
- Node.js 18+ e `npm` o `yarn`
- Git
- Windows: PowerShell consigliato per i comandi mostrati

Passaggi rapidi (sviluppo)
1. Recupera gli ultimi cambiamenti dal repository:

```powershell
git fetch origin
git checkout main
git pull
```

2. Installa dipendenze:

```powershell
npm install
```

3. Avvia in modalità sviluppo (server + file statici):

```powershell
npm run dev
```

 - `server/index.js` espone l'API su `http://localhost:3000` per impostazione predefinita.
 - I file statici `public/` vengono serviti su porta `3001` (con lo script `dev`).

Backup della base dati (SQLite)
1. Arresta l'app se in esecuzione.
2. Fai una copia del file DB:

```powershell
copy data\app.db data\app.db.bak
```

DB Schema e migrazioni
- Questo repository non include una utility di migrazione automatica. Per cambi di schema (es. rimuovere la colonna `price_per_day`) procedere così:
  - Effettua un backup (vedi sopra).
  - Crea un nuovo file DB di test o usa uno script SQL per applicare ALTER TABLE/CREATE TABLE temporanee.
  - Esegui manualmente gli script SQL in un ambiente di test prima di applicare al file di produzione.

Pubblicazione / Distribuzione GUI (Electron)
1. Per avviare l'app Electron in locale:

```powershell
npm run electron
```

2. Per creare un pacchetto Windows (installer/portable):

```powershell
npm run pack:win
```

Note utili
- Se il frontend non riflette le modifiche, svuota la cache del browser o riavvia l'app Electron.
- I passcode sono gestiti lato server; dopo aggiornamenti che toccano auth, chiedi agli utenti di effettuare logout/login.
- Le modifiche CSS sono centralizzate in `public/css/main.css`.
- I partials HTML si trovano in `public/partials/`.

Test rapido dopo aggiornamento
1. Avvia `npm run dev`.
2. Apri `http://localhost:3001` (o l'URL indicato dal dev server) e verifica le pagine principali: Home, Prenotazioni, Impostazioni.
3. Prova a creare/modificare una prenotazione e verifica che i controlli di overlap funzionino.

Rollback
- Se qualcosa va storto, ripristina il DB dal backup e ripristina la commit precedente:

```powershell
git checkout -- data\app.db
git reset --hard HEAD@{1}
```

Contatti e follow-up
- Se vuoi posso aggiungere script di migrazione SQL, un task `npm run migrate` o includere una sezione più dettagliata per il packaging CI.

---
Generated: istruzioni rapide per aggiornamenti e deploy locali.
