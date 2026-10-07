import { Component, ElementRef, HostListener, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-autocomplete',
  standalone: true,
  template: `
    <div class="relative w-full">
      <input
        class="field-control"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [value]="value()"
        [attr.maxlength]="maxLength()"
        [placeholder]="placeholder()"
        autocomplete="off"
        (focus)="open.set(true)"
        (input)="onInput($event)"
        (keydown.enter)="chooseFirst($event)"
        (keydown.escape)="open.set(false)"
      />
      @if (open() && filteredOptions().length) {
        <ul
          [id]="listId"
          role="listbox"
          class="absolute z-30 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          @for (option of filteredOptions(); track option) {
            <li role="presentation">
              <button
                type="button"
                role="option"
                [attr.aria-selected]="value() === option"
                class="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-teal-50 dark:hover:bg-slate-800"
                (click)="choose(option)"
              >
                {{ option }}
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AppAutocompleteComponent {
  constructor(private readonly element: ElementRef<HTMLElement>) {}
  readonly options = input<string[]>([]);
  readonly value = input('');
  readonly placeholder = input('Inizia a digitare');
  readonly maxLength = input(200);
  readonly maxOptions = input(8);
  readonly valueChange = output<string>();
  readonly open = signal(false);
  readonly listId = `autocomplete-options-${Math.random().toString(36).slice(2)}`;
  readonly filteredOptions = computed(() => {
    const query = this.value().trim().toLocaleLowerCase('it');
    return this.options()
      .filter((option) => !query || option.toLocaleLowerCase('it').includes(query))
      .slice(0, this.maxOptions());
  });

  onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
    this.open.set(true);
  }

  choose(value: string): void {
    this.valueChange.emit(value);
    this.open.set(false);
  }

  chooseFirst(event: Event): void {
    const first = this.filteredOptions()[0];
    if (!this.open() || !first) return;
    event.preventDefault();
    this.choose(first);
  }

  @HostListener('document:click', ['$event'])
  closeOutside(event: Event): void {
    if (!this.element.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
