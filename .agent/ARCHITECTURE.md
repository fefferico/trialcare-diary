# Architecture Map

> Aggiornato automaticamente il 30/10/2026, 21:45:00.

## Struttura

- `src/app/core/`: Auth, Supabase, Storage, UI state, PDF e accesso ai dati.
- `src/app/features/`: pagine dei registri clinici e componenti di sezione.
- `src/app/shared/`: dropdown, calendario e selettore orario accessibili.
- `supabase/migrations/`: schema PostgreSQL, policy RLS e Storage.

## Aree Angular rilevate: auth, components, core, dashboard, documents, features, models, shared

## File applicativi

- [App Component](../src/app/app.component.ts)
- [App Config](../src/app/app.config.ts)
- [App Routes](../src/app/app.routes.ts)
- [Login Component](../src/app/auth/login.component.ts)
- [Calendar Preview Component](../src/app/components/calendar-preview/calendar-preview.component.html)
- [Calendar Preview Component](../src/app/components/calendar-preview/calendar-preview.component.ts)
- [Auth Guard](../src/app/core/auth.guard.ts)
- [Auth Service](../src/app/core/auth.service.ts)
- [Biometric Auth Service](../src/app/core/biometric-auth.service.ts)
- [Confirmation Service](../src/app/core/confirmation.service.ts)
- [Data Export Service](../src/app/core/data-export.service.ts)
- [Diary Data Service](../src/app/core/diary-data.service.ts)
- [Modal Service](../src/app/core/modal.service.ts)
- [Pdf Export Service](../src/app/core/pdf-export.service.ts)
- [Storage Service](../src/app/core/storage.service.ts)
- [Supabase Client Service](../src/app/core/supabase-client.service.ts)
- [Toast Service](../src/app/core/toast.service.ts)
- [Ui State Service](../src/app/core/ui-state.service.ts)
- [Dashboard Component](../src/app/dashboard/dashboard.component.ts)
- [Document Scanner Component](../src/app/documents/document-scanner.component.ts)
- [Image To Pdf Component](../src/app/documents/image-to-pdf.component.ts)
- [Pdf Redaction Component](../src/app/documents/pdf-redaction.component.ts)
- [Calendar Event Form Dialog Component](../src/app/features/calendar/calendar-event-form-dialog.component.html)
- [Calendar Event Form Dialog Component](../src/app/features/calendar/calendar-event-form-dialog.component.ts)
- [Calendar Component](../src/app/features/calendar/calendar.component.html)
- [Calendar Component](../src/app/features/calendar/calendar.component.ts)
- [Feature Page Component](../src/app/features/feature-page.component.ts)
- [Section Wrappers](../src/app/features/section-wrappers.ts)
- [Diary Models](../src/app/models/diary.models.ts)
- [Medicine Cabinet Expiry](../src/app/models/medicine-cabinet-expiry.ts)
- [App Autocomplete Component](../src/app/shared/app-autocomplete.component.ts)
- [App Confirm Dialog Component](../src/app/shared/app-confirm-dialog.component.ts)
- [App Datepicker Component](../src/app/shared/app-datepicker.component.ts)
- [App Dropdown Component](../src/app/shared/app-dropdown.component.ts)
- [App Modal Host Component](../src/app/shared/app-modal-host.component.ts)
- [App Timepicker Component](../src/app/shared/app-timepicker.component.ts)
- [App Toast Container Component](../src/app/shared/app-toast-container.component.ts)
- [Tooltip Directive](../src/app/shared/directives/tooltip.directive.ts)
- [Document Association Picker Component](../src/app/shared/document-association-picker.component.ts)
- [Highlight Pipe](../src/app/shared/highlight.pipe.ts)
- [Medicine Image Editor Component](../src/app/shared/medicine-image-editor.component.ts)
- [Medicine Image Picker Component](../src/app/shared/medicine-image-picker.component.ts)
