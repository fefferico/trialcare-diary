# TrialCare Diary

Diario clinico digitale in Angular 21 per famiglie che accompagnano un bambino durante un trial clinico. L'interfaccia funziona su mobile, supporta tema chiaro/scuro e prepara PDF da condividere con il team curante.

## Funzioni

- Profili per più bambini, con identificativo trial e contatti clinici.
- Registro farmaci con dosaggi, formulazioni, date, pause e orari.
- Diario di sintomi, traumi ed eventi avversi.
- Percorsi terapeutici, documenti e ricevute in Storage privato.
- Note spese con calcolo della quota chilometrica (`km × tariffa/km`).
- Report PDF, accesso Supabase Auth e dati isolati da RLS.
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

La prima migrazione crea `children`, `medications`, `health_events`, `therapies`, `documents`, `expenses`, indici, trigger e RLS. La seconda crea il bucket privato `clinical-documents` (massimo 20 MiB, PDF e immagini) e le policy Storage. Le righe cliniche sono accessibili solo se il bambino collegato appartiene all'utente autenticato. Le sessioni concorrenti usano il comportamento normale di Supabase Auth.

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
