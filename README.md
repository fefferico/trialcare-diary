# TrialCare Diary

Diario clinico digitale in Angular 21 per famiglie che accompagnano un bambino durante un trial clinico. L'interfaccia funziona su mobile, supporta tema chiaro/scuro e prepara PDF da condividere con il team curante.

## Funzioni

- Profili per più bambini, con identificativo trial, gruppo sanguigno, allergie e informazioni cliniche essenziali.
- Storico di peso, altezza e circonferenza della testa con grafici di andamento per bambino.
- Registro farmaci con dosaggi, formulazioni, date, pause e orari.
- Inventario dei farmaci in casa con quantità, prezzo, dosaggio previsto e date di apertura e scadenza.
- Inventario di ortesi e ausili, come tutori, scarpe ortopediche, tutine e pantaloncini, con taglia, lato e periodo di utilizzo.
- Diario di sintomi, traumi ed eventi avversi.
- Calendario mensile con appuntamenti singoli o ricorrenti (settimanali, bisettimanali e mensili), conferma degli eventi futuri e motivazione per quelli saltati; riepilogo homepage di eventi, terapie e scadenze nei successivi 30 giorni.
- Percorsi terapeutici, documenti e ricevute in Storage privato. Per i PDF clinici è disponibile una redazione locale manuale o basata su testo selezionabile: la copia viene appiattita in immagini prima dell’upload. L’OCR locale legge anche le scansioni; il testo riconosciuto può essere corretto o scritto a mano e viene salvato con il documento per la ricerca.
- Note spese con calcolo della quota chilometrica (`km × tariffa/km`).
- Report PDF, accesso Supabase Auth e dati isolati da RLS.
- Avatar profilo personalizzabile: in Supabase l’immagine è privata e accessibile solo al proprietario; in modalità demo resta nel browser.
- Accesso biometrico locale tramite WebAuthn/passkey sui dispositivi compatibili.

## Avvio locale

Requisiti: Node.js 20.19 o successivo e npm.

```bash
npm install
npm start
```

Per collegare il progetto Supabase `upslsnpweosagvnkuzya`, imposta una chiave **publishable** (oppure la chiave `anon` legacy) in `src/environments/environment.ts`. La chiave è pubblica e va usata solo insieme a RLS. Non inserire mai una service role key nel frontend.

Il client Auth mantiene la sessione nel browser e rinnova i token; non viene configurata alcuna invalidazione delle altre sessioni. Per la modalità demo senza chiave, le voci sono conservate nel `localStorage` del browser e non vengono sincronizzate né cifrate: usa solo dati fittizi finché Supabase non è configurato.

L’accesso biometrico si attiva dopo aver effettuato l’accesso da un browser/dispositivo con WebAuthn e un autenticatore di piattaforma (ad esempio Touch ID, Face ID, Windows Hello o impronta Android). La passkey verifica localmente il dispositivo e il token di rinnovo Supabase necessario a ripristinare la sessione è conservato nel `localStorage`, come il resto della sessione browser. Attivalo solo su un dispositivo personale protetto; non abilitarlo su dispositivi condivisi. Per revocarlo usa l’icona biometrica nella barra superiore o nell’area account.

## Supabase Cloud

Le migrazioni sono in `supabase/migrations/` e non vengono applicate automaticamente. Esaminale, collega la CLI e applicale dopo averne verificato il contenuto:

```bash
npx supabase login
npx supabase link --project-ref upslsnpweosagvnkuzya
npx supabase db push
```

La migrazione `202610060001_trialcare_schema.sql` documenta lo schema relazionale consolidato: profili, farmaci, eventi, terapie, documenti, spese, contatti, inventario e misure, inclusi i campi introdotti dalle migrazioni successive, indici, trigger e RLS. Le migrazioni successive restano necessarie per gli ambienti in cui risultano già applicate le versioni precedenti dello schema. La seconda crea il bucket privato `clinical-documents` (massimo 20 MiB, PDF e immagini) e le policy Storage. La migrazione `202610060011_trialcare_health_event_location.sql` aggiunge il luogo facoltativo agli eventi di salute. Le righe cliniche sono accessibili solo se il bambino collegato appartiene all'utente autenticato. Le sessioni concorrenti usano il comportamento normale di Supabase Auth.

La redazione PDF è un’elaborazione locale nel browser; la ricerca automatica delle zone da oscurare rileva solo corrispondenze testuali selezionabili e non garantisce la rimozione di ogni dato identificativo. L’OCR delle scansioni può contenere errori: controlla il testo prima del salvataggio. Se crei un PDF oscurato, il testo precedente viene scartato e riletto dalla copia oscurata. L’app non cifra gli allegati con una chiave controllata dall’utente: aggiungere cifratura end-to-end richiederebbe definire custodia, recupero e condivisione delle chiavi, perché la perdita della chiave renderebbe i documenti irrecuperabili.

Le chiavi publishable/anon possono essere esposte nel bundle browser. RLS resta il confine di sicurezza. Per la condivisione clinica, configurare l'accesso dei soli operatori autorizzati richiede un distinto modello di inviti e deleghe: per ora l'account è il solo proprietario dei propri dati.

## GitHub Pages

La navigazione usa hash route e la cartella `public/` contiene `404.html` e lo script di ripristino. Per produrre asset con base relativa, adatta la GitHub Action o il workflow di deploy a:

```bash
npm run build:pages
```

Pubblica il contenuto di `dist/trialcare-diary/browser/` (builder Angular application) su GitHub Pages. Hash routing permette i collegamenti diretti anche dopo un refresh; il fallback 404 copre i link con percorso tradizionale.

Il workflow `.github/workflows/deploy-pages.yml` automatizza build e deploy a ogni push su `main`. Nel repository GitHub aggiungi la variabile Actions `SUPABASE_PUBLISHABLE_KEY` e imposta GitHub Pages come sorgente **GitHub Actions**. La chiave è publishable, finisce nel bundle browser e deve sempre essere protetta da RLS.

## Libreria viva del progetto

`npm run update-context` aggiorna `.agent/API_CATALOG.md`, `.agent/ARCHITECTURE.md` e `.agent/HEALTH_REPORT.md` a partire dai sorgenti effettivi. Eseguilo dopo aver cambiato componenti, servizi, rotte o schema.

## Build

```bash
npm run build
```
