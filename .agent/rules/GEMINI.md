---
trigger: always_on
---

# GEMINI.md — Antigravity Kit

Priority: P0(this file) > P1(Agent.md) > P2(SKILL.md)
Format for this file: bullets + key-value only, no prose.

## AGENT/SKILL LOAD
Agent active → `.agent/agents/{agent}.md` → check `skills:` frontmatter → SKILL.md (index only) → read matching section only. Never read whole skill folder.

Pre-response check (code/design only):
1. domain → agent (table below)
2. read agent rules
3. announce: `🤖 Applying knowledge of @[agent]...`
4. load skills from frontmatter → apply

`@agent` in prompt → force that agent, skip auto-select.
Multi-domain → `orchestrator` + Socratic Gate.

## REQUEST CLASSIFIER
| Type | Trigger | Tiers | Out |
|---|---|---|---|
| QUESTION | what/how/explain | T0 | text |
| SURVEY | analyze/list/overview | T0+Explorer | intel, no file |
| SIMPLE CODE | fix/add/change (1 file) | T0+T1-lite | inline edit |
| COMPLEX CODE | build/create/implement/refactor | T0+T1+Agent | `{task-slug}.md` req |
| DESIGN/UI | design/UI/page/dashboard | T0+T1+Agent | `{task-slug}.md` req |
| SLASH | /create /orchestrate /debug | own flow | var |

## T0 — UNIVERSAL
- Lang: think in en → reply in user's lang. Code/vars/comments = en always.
- Clean code (`@[skills/clean-code]`): concise, no over-eng, self-documenting. Tests: Unit>Int>E2E, AAA pattern, mandatory. Perf: measure first, Core Web Vitals 2025. Secrets: verify security.
- File deps: edit → check `CODEBASE.md#File-Dependencies` → update all dependents together.
- API refs: codice referenzia un metodo/servizio non già in contesto → check `API_CATALOG_INDEX.md` (indice leggero, nome+summary+link) → apri SOLO `.agent/api_catalog/{service-slug}.md` per quel servizio. Mai aprire più file del necessario, mai leggere l'intera cartella `api_catalog/`.
- DB sync: any table/RLS/index/RPC/constraint change → update `documentation/db_docs/*` same turn (e.g. `0_tables_creation_ddl.sql`, `2_rls_policies_ddl.sql`). Append-mode obbligatorio per nuove definizioni (tabelle/funzioni/viste sempre in coda ai file `0_*`, `1_*` ecc.) per non rompere l'ordine delle dipendenze ed evitare errori tipo "No function matches given name...". Idempotenza e riesecuzione postuma obbligatorie: usare sempre `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER/POLICY IF EXISTS ... CREATE ...`, `IF NOT EXISTS` su tabelle/colonne/indici.
- System map: read `ARCHITECTURE.md` @ session start. Agents=`.agent/` · Skills=`.agent/skills/` · Scripts=`.agent/skills/<skill>/scripts/`.
- Method: read → why (goal + principles + delta-vs-generic) → apply → code. Never read→code direct.
- Auth & Security Safeguards: mai rompere o sovrascrivere la logica core di `@auth.service.ts` e `@biometric-auth.service.ts`. Tutte le feature devono integrarsi con i Signals e i flussi di sessione/dispositivi esistenti.
- Impersonation: preservare sempre `_originalUser` vs `_currentUser` in `@auth.service.ts`. Durante l'impersonificazione l'utente reale rimane tracciato e il ripristino deve essere trasparente.
- Demo Service (`@demo-mode.service.ts`): gestire sempre i metodi async in modalità demo con fake data a runtime o feedback visivo via AlertService/ToastService, evitando scritture DB reali (`isWriteAllowed() === false`).
- UI Scroll Lock: pulizia obbligatoria dei lock UI con `@resetBodyScroll` in `ngOnDestroy` per ogni componente con overlay/dialog/drawer.
- Select components: uso esclusivo di `<app-dropdown>` per qualsiasi tag select nell'app.
- Iconography & No Emoticons: divieto assoluto di emoji/emoticon testuali Unicode nell'interfaccia utente; usare esclusivamente FontAwesome (`<fa-icon [icon]="...">`) oppure il registry centrale SVG (`'icon-name' | icon` da `src/assets/config/icons-registry.json`).
- Supabase & Remote DB Safety (P0): divieto assoluto per l'agente di eseguire in autonomia comandi CLI sul DB remoto (inclusi `npx supabase db query`, `npx supabase db push`, `npx supabase db reset`, esecuzione di migrazioni o query DDL/DML sul database collegato). L'agente deve esclusivamente predisporre i file SQL/migrazioni e mostrare la query/comando: l'esecuzione sul database spetta unicamente ed esclusivamente all'utente.

### OUTPUT PROTOCOL (every response, code or text)
Goal: max density, min tokens, same accuracy.

- No-prose: bullets/key-value only. No narration ("I am now going to...").
- Shorthand: symbols (→ ∵ Δ !) + std abbrev (auth, env, cfg, impl, req).
- Zero-why: fix first, explain only if asked.
- Micro-diff: code changes = `- old` / `+ new` lines only. Never re-print full file/function unless file is new or user asks for full.
- Syntax: modern/compact (early return, destructuring) > verbose loops/nesting.
- Zero-comment: strip obvious comments. Comment only non-obvious *why*, never *what*.
- Scope lock: fix only what's asked. No unsolicited refactor/cleanup elsewhere.
- Data>Logic: replace long if/else/switch chains with lookup maps/objects where sensible.
- Fallback: projected output > 200 tokens → STOP. Re-scope, use CLI (grep/jq/rg) instead, or ask permission before generating.

Exceptions (full prose/explanation allowed): user asks "why/explain/how does this work", Socratic Gate questions, `{task-slug}.md` planning docs, this file's Design/Architecture sections.

## T1 — CODE
Project→Agent:
| Type | Agent | Skill |
|---|---|---|
| MOBILE (iOS/Android/RN/Flutter) | mobile-developer | mobile-design |
| WEB (Angular/Next.js/React) | frontend-specialist | frontend-design, angular-patterns, angular-best-practices, electron-development |
| BACKEND (API/server/DB/Supabase) | backend-specialist | api-patterns, database-design, supabase, supabase-postgres-best-practices |

! mobile ≠ frontend-specialist, ever.

**Component Size Guard** (any framework, before finalizing any component/template):
- Template >150 lines, OR >3 nested control-flow levels, OR mixed responsibilities (layout+state+multiple data domains) → STOP, split into sub-component(s) first.
- Repeated markup block (2×+) → extract immediately, regardless of size.
- Never ship a "monster" component to satisfy speed; size-check is part of Definition of Done, not optional polish.

Socratic Gate (before any tool/impl):
| Req | Action |
|---|---|
| new feature/build | ≥3 strategic Qs |
| edit/fix | confirm understanding + impact Qs |
| vague/simple | ask: purpose, users, scope |
| full orchestration | hold subagents → user confirms plan |
| "proceed" (direct) | still ask 2 edge-case Qs |

Rule: 1% unclear → ask. Numbered answers given → still gate on trade-offs/edge-cases, don't skip. Ref: `@[skills/brainstorming]`.

Final checklist (trigger: "final checks"/"son kontrolleri yap"):
- audit: `python .agent/scripts/checklist.py .`
- pre-deploy: `python .agent/scripts/checklist.py . --url <URL>` (+perf+E2E)
- order: Security→Lint→Schema→Tests→UX→SEO→Lighthouse/E2E
- done = checklist.py success. fail → fix Critical (Security/Lint) first.

Scripts (`python .agent/skills/<skill>/scripts/<script>.py`):
security_scan.py, dependency_analyzer.py = vulnerability-scanner
lint_runner.py = lint-and-validate (every change)
test_runner.py = testing-patterns (after logic Δ)
schema_validator.py = database-design (after DB Δ)
ux_audit.py, accessibility_checker.py = frontend-design (after UI Δ)
seo_checker.py = seo-fundamentals
bundle_analyzer.py, lighthouse_audit.py = performance-profiling (pre-deploy)
mobile_audit.py = mobile-design
playwright_runner.py = webapp-testing (pre-deploy)

Gemini modes:
| Mode | Agent | Behavior |
|---|---|---|
| plan | project-planner | Analysis→Planning(`{task-slug}.md`)→Solutioning(no code)→Implementation |
| ask | — | understand + ask only |
| edit | orchestrator | exec; check `{task-slug}.md` first. multi-file/structural→offer to create it; single-file→direct |

## T2 — DESIGN (pointer only)
Full rules live in agent files, not here:
`.agent/frontend-specialist.md` (web) · `.agent/mobile-developer.md` (mobile)
Contains: Purple Ban, Template Ban, anti-cliché, Deep Design Thinking.
Read agent file before any design work.

## REFERENCE
Agents: orchestrator, project-planner, security-auditor, backend-specialist, frontend-specialist, mobile-developer, debugger, game-developer
Skills: clean-code, brainstorming, app-builder, frontend-design, mobile-design, plan-writing, behavioral-modes, supabase, supabase-postgres-best-practices, angular-best-practices, angular-state-management, electron-development, playwright-skill
Scripts: verify_all.py, checklist.py, security_scan.py, dependency_analyzer.py, ux_audit.py, mobile_audit.py, lighthouse_audit.py, seo_checker.py, playwright_runner.py, test_runner.py
