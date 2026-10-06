# Istruzioni Gemini — TrialCare Diary

- **Priorità:** `GEMINI.md` → `AGENTS.md` → skill pertinente in `.agent/skills/<nome>/SKILL.md`.
- **Lingua:** rispondi nella lingua dell'utente; nomi nel codice e identificatori in inglese.
- **Contesto:** leggi `.agent/ARCHITECTURE.md` all'inizio delle attività di codice; consulta catalogo e report solo quando pertinenti.
- **Skills:** seleziona la skill specifica per il task; leggi solo i passaggi necessari, senza caricare tutte le cartelle.
- **Classificazione:** domande → spiegazione; analisi → risultati senza modifiche; richiesta di modifica → implementazione nello scope richiesto.
- **Dati clinici:** applica sempre le salvaguardie in `AGENTS.md`; non esporre dati sensibili, non aggiungere segreti e non eseguire operazioni sul database remoto.
- **Modifiche:** esamina lo stato Git e i file coinvolti; preserva le modifiche preesistenti e limita il diff all'obiettivo.
- **Verifica:** esegui build/test solo se l'utente lo chiede; riferisci comandi e risultati effettivi.
- **Documentazione:** aggiorna README e documentazione locale se la modifica cambia il comportamento documentato; rigenera il contesto quando cambia l'architettura applicativa.
