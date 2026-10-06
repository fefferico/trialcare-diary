# API Catalog

> Generato da `npm run update-context` il 06/10/2026, 21:37:18.

## Servizi

### AuthService

File: [src/app/core/auth.service.ts](../src/app/core/auth.service.ts)

- `signIn(email: string, password: string)`: `Promise<void>`
- `signUp(email: string, password: string)`: `Promise<void>`
- `signOut()`: `Promise<void>`

### BiometricAuthService

File: [src/app/core/biometric-auth.service.ts](../src/app/core/biometric-auth.service.ts)

- `checkAvailability()`: `Promise<void>`
- `enroll()`: `Promise<void>`
- `signIn()`: `Promise<void>`
- `revoke()`: `void`

### DataExportService

File: [src/app/core/data-export.service.ts](../src/app/core/data-export.service.ts)

- `export(format: 'json' | 'markdown' | 'doc')`: `Promise<void>`

### DiaryDataService

File: [src/app/core/diary-data.service.ts](../src/app/core/diary-data.service.ts)

- `load(section: SectionId)`: `Promise<void>`
- `loadAllForSearch()`: `Promise<SearchableDiaryItem[]>`
- `loadAllForExport()`: `Promise<DiaryExportData>`
- `localMeasurements(childId?: string)`: `DiaryRow[]`
- `saveMeasurement(childId: string, value: Record<string, unknown>)`: `Promise<boolean>`
- `loadReport(childId?: string)`: `Promise<void>`
- `save(
    section: SectionId,
    value: Record<string, unknown>,
    childId?: string,
  )`: `Promise<boolean>`
- `saveMany(
    section: SectionId,
    values: Record<string, unknown>[],
    childId?: string,
  )`: `Promise<boolean>`
- `remove(section: SectionId, row: DiaryRow)`: `Promise<void>`
- `update(section: SectionId, id: string, value: Record<string, unknown>)`: `Promise<boolean>`

### PdfExportService

File: [src/app/core/pdf-export.service.ts](../src/app/core/pdf-export.service.ts)

- `export(section: SectionDefinition, rows: DiaryRow[], childName: string)`: `void`

### StorageService

File: [src/app/core/storage.service.ts](../src/app/core/storage.service.ts)

- `upload(file: File, childId: string)`: `Promise<string | null>`
- `signedUrl(path: string)`: `Promise<string | null>`
- `uploadVoice(file: File, childId: string)`: `Promise<string | null>`
- `saveAvatar(file: File)`: `Promise<string | null>`
- `removeAvatar()`: `Promise<void>`
- `loadAvatar()`: `Promise<string | null>`

### SupabaseClientService

File: [src/app/core/supabase-client.service.ts](../src/app/core/supabase-client.service.ts)

Methods are defined in the source file.

### UiStateService

File: [src/app/core/ui-state.service.ts](../src/app/core/ui-state.service.ts)

- `toggleTheme()`: `void`
- `setModal(open: boolean)`: `void`
- `resetBodyScroll()`: `void`

## Standalone components

- [AppComponent](../src/app/app.component.ts)
- [LoginComponent](../src/app/auth/login.component.ts)
- [CalendarPreviewComponent](../src/app/calendar/calendar-preview.component.ts)
- [CalendarComponent](../src/app/calendar/calendar.component.ts)
- [DashboardComponent](../src/app/dashboard/dashboard.component.ts)
- [PdfRedactionComponent](../src/app/documents/pdf-redaction.component.ts)
- [FeaturePageComponent](../src/app/features/feature-page.component.ts)
- [ChildProfileComponent](../src/app/features/section-wrappers.ts)
- [AppDatepickerComponent](../src/app/shared/app-datepicker.component.ts)
- [AppDropdownComponent](../src/app/shared/app-dropdown.component.ts)
- [AppTimepickerComponent](../src/app/shared/app-timepicker.component.ts)
