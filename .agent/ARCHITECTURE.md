# Architecture Map

> Aggiornato automaticamente il 06/10/2026, 17:49:07.

## Struttura

- `src/app/core/`: Auth, Supabase, Storage, UI state, PDF e accesso ai dati.
- `src/app/features/`: pagine dei registri clinici e componenti di sezione.
- `src/app/shared/`: dropdown, calendario e selettore orario accessibili.
- `supabase/migrations/`: schema PostgreSQL, policy RLS e Storage.

## Aree Angular rilevate: auth, core, dashboard, features, models, shared

## File applicativi

- [App Component](../src/app/app.component.ts)
- [App Config](../src/app/app.config.ts)
- [App Routes](../src/app/app.routes.ts)
- [Login Component](../src/app/auth/login.component.ts)
- [Auth Service](../src/app/core/auth.service.ts)
- [Diary Data Service](../src/app/core/diary-data.service.ts)
- [Pdf Export Service](../src/app/core/pdf-export.service.ts)
- [Storage Service](../src/app/core/storage.service.ts)
- [Supabase Client Service](../src/app/core/supabase-client.service.ts)
- [Ui State Service](../src/app/core/ui-state.service.ts)
- [Dashboard Component](../src/app/dashboard/dashboard.component.ts)
- [Feature Page Component](../src/app/features/feature-page.component.ts)
- [Section Wrappers](../src/app/features/section-wrappers.ts)
- [Diary Models](../src/app/models/diary.models.ts)
- [App Datepicker Component](../src/app/shared/app-datepicker.component.ts)
- [App Dropdown Component](../src/app/shared/app-dropdown.component.ts)
- [App Timepicker Component](../src/app/shared/app-timepicker.component.ts)
