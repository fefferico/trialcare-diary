# Regole del progetto TrialCare Diary

## Contesto
- Applicazione diario clinico per famiglie che accompagnano un bambino durante un trial clinico.
- Stack: Angular 21, TypeScript, Tailwind CSS 4, Supabase Auth/Database/Storage, GitHub Pages.
- Sorgenti: `src/app/`; migrazioni locali: `supabase/migrations/`; documentazione generata: `.agent/`.
- Skills: `.agent/skills/`. Prima di intervenire su moduli complessi, consulta la skill pertinente e leggi solo le sezioni necessarie.
- Mantieni sincronizzati README, documentazione `.agent/` e implementazione quando una modifica li rende incoerenti.

## Salvaguardie dati clinici e sicurezza
- Tratta diario, documenti, sintomi, farmaci, contatti e spese come dati sensibili. Non aggiungere telemetria, logging o esportazioni che espongano dati personali o clinici.
- Non inserire segreti o service role key nel frontend, nei file versionati o negli output. Le chiavi publishable/anon sono utilizzabili solo con RLS correttamente configurato.
- Preserva l'isolamento per utente e le policy RLS. Ogni accesso ai dati deve restare vincolato all'utente autenticato e alle relazioni previste.
- Mantieni i flussi esistenti di Supabase Auth, sessione, WebAuthn/passkey e archiviazione locale; non indebolire autenticazione, autorizzazioni o protezione dei documenti.
- In modalità demo o senza configurazione remota usa dati fittizi/locali e non inviare dati clinici reali a servizi esterni.
- **Database remoto:** non eseguire comandi CLI, query o migrazioni sul database Supabase collegato. Prepara solo migrazioni e documentazione locali. L'utente esegue personalmente ogni operazione remota.
- Le migrazioni devono essere sicure da rieseguire, con definizioni idempotenti ove possibile. Mantieni la documentazione dello schema coerente con le migrazioni.

## Architettura e UI
- Usa Angular standalone, Signals e il control flow moderno (`@if`, `@for`) coerentemente con il codice esistente.
- Riutilizza i componenti condivisi per input data/ora e dropdown; evita controlli nativi incoerenti con il design system.
- Interfaccia responsive, accessibile e compatibile con tema chiaro/scuro. Non usare emoji o emoticon Unicode come icone UI.
- Rilascia sempre eventuali blocchi di scroll/listener/risorse nei lifecycle hook appropriati.
- Estrai componenti quando template o responsabilità diventano difficili da mantenere; evita refactor fuori dallo scopo richiesto.

## Modifiche e verifica
- Controlla lo stato Git e preserva le modifiche preesistenti dell'utente.
- Segui gli script e i comandi già definiti in `package.json`; non inventare procedure di deploy o applicazione migrazioni.
- Dopo ogni modifica al codice applicativo, esegui una build di compilazione usando lo script `build` definito in `package.json` (per esempio `npm run build`). Se la cartella di output predefinita non è scrivibile o contiene file protetti, imposta una cartella temporanea tramite l'opzione supportata dalla build e ripeti la compilazione. Correggi gli errori introdotti dalla modifica e ripeti la build finché termina correttamente; riporta eventuali avvisi e impedimenti residui.
- Non lanciare test o altre verifiche non richiesti dall'utente. Riporta esattamente i comandi di build eseguiti e il risultato.
- Dopo modifiche a rotte, servizi o componenti, aggiorna il contesto generato con `npm run update-context` quando pertinente.
- Prima di modificare codice esistente, leggi i file coinvolti e i relativi chiamanti/dipendenze necessari.
