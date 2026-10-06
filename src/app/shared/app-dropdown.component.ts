import { Component, ElementRef, HostListener, input, output, signal } from '@angular/core';

@Component({ selector:'app-dropdown', standalone:true, template:`
  <div class="relative w-full">
    <button type="button" class="field-control flex items-center justify-between text-left" [attr.aria-expanded]="open()" (click)="open.update(v => !v)">
      <span [class.text-slate-400]="!value()">{{ value() || placeholder() }}</span><span aria-hidden="true" class="text-slate-400">⌄</span>
    </button>
    @if (open()) { <div role="listbox" class="absolute z-30 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      @for (option of options(); track option) { <button type="button" role="option" [attr.aria-selected]="multiple() ? values().includes(option) : value() === option" class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-teal-50 dark:hover:bg-slate-800" (click)="choose(option)">@if(multiple()){<span class="grid h-4 w-4 place-items-center rounded border border-slate-300 text-[10px]">{{values().includes(option)?'✓':''}}</span>}{{ option }}</button> }
    </div> }
  </div>` })
export class AppDropdownComponent {
  readonly options = input<string[]>([]); readonly value = input(''); readonly values = input<string[]>([]); readonly multiple = input(false); readonly placeholder = input('Seleziona'); readonly selection = output<string>(); readonly selectionChange = output<string[]>(); readonly open = signal(false);
  constructor(private readonly element: ElementRef<HTMLElement>) {}
  choose(value: string): void { if(this.multiple()){const next=this.values().includes(value)?this.values().filter(item=>item!==value):[...this.values(),value];this.selectionChange.emit(next);return;} this.selection.emit(value); this.open.set(false); }
  @HostListener('document:click', ['$event']) closeOutside(event: Event): void { if (!this.element.nativeElement.contains(event.target as Node)) this.open.set(false); }
}
