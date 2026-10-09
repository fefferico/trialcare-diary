# API Catalog

> Generato da `npm run update-context` il 09/10/2026, 14:33:03.

## Servizi

### AuthService

File: [src/app/core/auth.service.ts](../src/app/core/auth.service.ts)

- `signIn(email: string, password: string)`: `Promise<boolean>`
- `signUp(email: string, password: string)`: `Promise<void>`
- `signOut()`: `Promise<void>`

### BiometricAuthService

File: [src/app/core/biometric-auth.service.ts](../src/app/core/biometric-auth.service.ts)

- `checkAvailability()`: `Promise<void>`
- `refreshEnrollmentStatus()`: `void`
- `syncCurrentSession()`: `Promise<void>`
- `enroll()`: `Promise<void>`
- `signIn()`: `Promise<void>`
- `revoke()`: `void`

### ConfirmationService

File: [src/app/core/confirmation.service.ts](../src/app/core/confirmation.service.ts)

- `confirm(message: string, options: Partial<ConfirmationRequest> = {})`: `Promise<boolean>`
- `finish(confirmed: boolean)`: `void`

### DataExportService

File: [src/app/core/data-export.service.ts](../src/app/core/data-export.service.ts)

- `export(format: 'json' | 'markdown' | 'doc')`: `Promise<void>`

### DiaryDataService

File: [src/app/core/diary-data.service.ts](../src/app/core/diary-data.service.ts)

- `load(section: SectionId)`: `Promise<void>`
- `loadAllForSearch()`: `Promise<SearchableDiaryItem[]>`
- `loadCalendarEntries(startDate: string, endDate: string)`: `Promise<SearchableDiaryItem[]>`
- `loadAllForExport()`: `Promise<DiaryExportData>`
- `localMeasurements(childId?: string)`: `DiaryRow[]`
- `saveMeasurement(childId: string, value: Record<string, unknown>)`: `Promise<boolean>`
- `markMedicationDoseTaken(
    medicationId: string,
    childId: string,
    scheduledDate: string,
    scheduledTime: string,
    takenAt: string,
  )`: `Promise<boolean>`
- `markMedicationDosesTaken(
    medicationId: string,
    childId: string,
    doses: Array<{ scheduledDate: string; scheduledTime: string; takenAt: string }>,
  )`: `Promise<boolean>`
- `markMedicationDoseSkipped(
    medicationId: string,
    childId: string,
    scheduledDate: string,
    scheduledTime: string,
    reason: string,
  )`: `Promise<boolean>`
- `loadReport(childId?: string)`: `Promise<void>`
- `save(
    section: SectionId,
    value: Record<string, unknown>,
    childId?: string,
  )`: `Promise<boolean>`
- `saveWithId(
    section: SectionId,
    value: Record<string, unknown>,
    childId?: string,
  )`: `Promise<string | null>`
- `searchDocuments(childId: string, search: string, limit = 30)`: `Promise<DiaryRow[]>`
- `loadDocumentsByIds(childId: string, ids: string[])`: `Promise<DiaryRow[]>`
- `loadDocumentLinks(
    target: DocumentLinkTarget,
    targetId: string,
    childId: string,
  )`: `Promise<string[]>`
- `setDocumentLinks(
    target: DocumentLinkTarget,
    targetId: string,
    childId: string,
    documentIds: string[],
  )`: `Promise<boolean>`
- `saveMany(
    section: SectionId,
    values: Record<string, unknown>[],
    childId?: string,
  )`: `Promise<boolean>`
- `remove(section: SectionId, row: DiaryRow)`: `Promise<void>`
- `update(section: SectionId, id: string, value: Record<string, unknown>)`: `Promise<boolean>`
- `updateCalendarEventSeries(
    recurrenceGroupId: string,
    childId: string,
    value: Record<string, unknown>,
    fromDate?: string,
  )`: `Promise<boolean>`

### PdfExportService

File: [src/app/core/pdf-export.service.ts](../src/app/core/pdf-export.service.ts)

- `exportVisitSummary(rows: DiaryRow[], childName: string, from: string, to: string)`: `void`
- `export(section: SectionDefinition, rows: DiaryRow[], childName: string)`: `void`

### StorageService

File: [src/app/core/storage.service.ts](../src/app/core/storage.service.ts)

- `upload(file: File, childId: string)`: `Promise<string | null>`
- `saveLocalFile(file: File)`: `Promise<string>`
- `openLocalFile(id: string)`: `Promise<boolean>`
- `getLocalFile(id: string)`: `Promise<File | null>`
- `removeLocalFile(id: string)`: `Promise<void>`
- `signedUrl(path: string)`: `Promise<string | null>`
- `downloadDocument(path: string)`: `Promise<Blob | null>`
- `removeDocument(path: string)`: `Promise<boolean>`
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
- [CalendarPreviewComponent](../src/app/components/calendar-preview/calendar-preview.component.ts)
- [DashboardComponent](../src/app/dashboard/dashboard.component.ts)
- [PdfRedactionComponent](../src/app/documents/pdf-redaction.component.ts)
- [CalendarComponent](../src/app/features/calendar/calendar.component.ts)
- [FeaturePageComponent](../src/app/features/feature-page.component.ts)
- [ChildProfileComponent](../src/app/features/section-wrappers.ts)
- [AppAutocompleteComponent](../src/app/shared/app-autocomplete.component.ts)
- [AppConfirmDialogComponent](../src/app/shared/app-confirm-dialog.component.ts)
- [AppDatepickerComponent](../src/app/shared/app-datepicker.component.ts)
- [AppDropdownComponent](../src/app/shared/app-dropdown.component.ts)
- [AppTimepickerComponent](../src/app/shared/app-timepicker.component.ts)
- [DocumentAssociationPickerComponent](../src/app/shared/document-association-picker.component.ts)
