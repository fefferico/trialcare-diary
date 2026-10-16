import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Signal, WritableSignal, input } from '@angular/core';
import { DiaryRow } from '../../models/diary.models';
import { AppAutocompleteComponent } from '../../shared/app-autocomplete.component';
import { DocumentAssociationPickerComponent } from '../../shared/document-association-picker.component';
import { AppDatepickerComponent } from '../../shared/app-datepicker.component';
import { AppDropdownComponent } from '../../shared/app-dropdown.component';
import { AppTimepickerComponent } from '../../shared/app-timepicker.component';

export interface CalendarEventFormController {
  editingEvent: Signal<unknown | null>;
  title: WritableSignal<string>;
  eventDate: WritableSignal<string>;
  eventTime: WritableSignal<string>;
  eventCategory: WritableSignal<string>;
  categoryOptions: string[];
  specialistOptions: Signal<string[]>;
  specialist: WritableSignal<string>;
  locationOptions: Signal<string[]>;
  location: WritableSignal<string>;
  eventStatus: WritableSignal<string>;
  eventSkippedReason: WritableSignal<string>;
  availableContacts: Signal<DiaryRow[]>;
  selectedContactIds: WritableSignal<string[]>;
  contactSearchLoading: Signal<boolean>;
  filteredContacts: Signal<DiaryRow[]>;
  repeat: WritableSignal<string>;
  repeatUntil: WritableSignal<string>;
  notes: WritableSignal<string>;
  children: Signal<{ id: string; name: string }[]>;
  childId: WritableSignal<string>;
  selectedDocuments: WritableSignal<DiaryRow[]>;
  associatedFiles: WritableSignal<File[]>;
  documentSearchLoading: Signal<boolean>;
  saveError: WritableSignal<string>;
  saving: Signal<boolean>;
  documentsForSelectedChild(): DiaryRow[];
  closeForm(): void;
  saveEvent(): Promise<void>;
  searchContacts(query: string): void;
  toggleContact(contactId: string, checked: boolean): void;
  changeChild(childId: string): void;
  searchDocuments(query: string): void;
}

@Component({
  selector: 'tc-calendar-event-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    AppAutocompleteComponent,
    DocumentAssociationPickerComponent,
    AppDatepickerComponent,
    AppDropdownComponent,
    AppTimepickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar-event-form-dialog.component.html',
})
export class CalendarEventFormDialogComponent {
  readonly controller = input.required<CalendarEventFormController>();
}
