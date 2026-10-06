# API Catalog

> Generato da `npm run update-context` il 06/10/2026, 17:49:07.

## Servizi

### AuthService

File: [src/app/core/auth.service.ts](../src/app/core/auth.service.ts)

- `signIn(email: string, password: string)`: `Promise<void>`
- `signUp(email: string, password: string)`: `Promise<void>`
- `signOut()`: `Promise<void>`

### DiaryDataService

File: [src/app/core/diary-data.service.ts](../src/app/core/diary-data.service.ts)

- `load(section: SectionId)`: `Promise<void>`
- `loadReport(childId?: string)`: `Promise<void>`
- `save(section: SectionId, value: Record<string, unknown>, childId?: string)`: `Promise<boolean>`
- `remove(section: SectionId, row: DiaryRow)`: `Promise<void>`
- `update(section: SectionId, id: string, value: Record<string, unknown>)`: `Promise<boolean>`

### PdfExportService

File: [src/app/core/pdf-export.service.ts](../src/app/core/pdf-export.service.ts)

- `export(section: SectionDefinition, rows: DiaryRow[], childName: string)`: `void`

### StorageService

File: [src/app/core/storage.service.ts](../src/app/core/storage.service.ts)

- `upload(file: File, childId: string)`: `Promise<string | null>`
- `signedUrl(path: string)`: `Promise<string | null>`

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
- [DashboardComponent](../src/app/dashboard/dashboard.component.ts)
- [FeaturePageComponent](../src/app/features/feature-page.component.ts)
- [ChildProfileComponent](../src/app/features/section-wrappers.ts)
- [AppDatepickerComponent](../src/app/shared/app-datepicker.component.ts)
- [AppDropdownComponent](../src/app/shared/app-dropdown.component.ts)
- [AppTimepickerComponent](../src/app/shared/app-timepicker.component.ts)
