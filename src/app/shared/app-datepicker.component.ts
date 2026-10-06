import { Component, input, output, signal } from '@angular/core';

@Component({ selector:'app-datepicker', standalone:true, template:`
  <div class="relative">
    <div class="flex gap-2"><input class="field-control min-w-0 flex-1" type="text" inputmode="numeric" [value]="displayValue()" placeholder="gg/mm/aaaa" [attr.aria-label]="label()" (input)="onInput($event)"><button type="button" class="icon-button" [attr.aria-label]="'Apri calendario: ' + label()" (click)="calendarOpen.update(v => !v)">▦</button></div>
    @if (calendarOpen()) { <div class="absolute z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"><div class="mb-3 flex items-center justify-between"><button type="button" class="icon-button" (click)="shiftMonth(-1)">‹</button><strong class="text-sm">{{ monthLabel() }}</strong><button type="button" class="icon-button" (click)="shiftMonth(1)">›</button></div><div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">@for (day of weekdays; track day) { <span class="py-1">{{ day }}</span> }</div><div class="grid grid-cols-7 gap-1">@for (day of days(); track $index) { <button type="button" class="h-8 rounded-lg text-sm hover:bg-teal-50 dark:hover:bg-slate-800" [disabled]="!day" (click)="choose(day)">{{ day || '' }}</button> }</div></div> }
  </div>` })
export class AppDatepickerComponent {
  readonly label = input('Data'); readonly value = input(''); readonly dateChange = output<string>(); readonly calendarOpen = signal(false); readonly weekdays = ['L','M','M','G','V','S','D']; private cursor = new Date();
  readonly monthLabel = signal(''); readonly days = signal<(number | null)[]>([]);
  constructor() { this.refresh(); }
  displayValue(): string { const value = this.value(); if (!value) return ''; const [y,m,d] = value.split('-'); return y && m && d ? `${d}/${m}/${y}` : value; }
  onInput(event: Event): void { const text = (event.target as HTMLInputElement).value.trim(); const match = /^([0-3]?\d)\/([01]?\d)\/(\d{4})$/.exec(text); if (match) this.dateChange.emit(`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`); else if (!text) this.dateChange.emit(''); }
  shiftMonth(delta: number): void { this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + delta, 1); this.refresh(); }
  choose(day: number | null): void { if (!day) return; this.dateChange.emit(`${this.cursor.getFullYear()}-${String(this.cursor.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`); this.calendarOpen.set(false); }
  private refresh(): void { this.monthLabel.set(this.cursor.toLocaleDateString('it-IT',{month:'long',year:'numeric'})); const first=(new Date(this.cursor.getFullYear(),this.cursor.getMonth(),1).getDay()+6)%7; const total=new Date(this.cursor.getFullYear(),this.cursor.getMonth()+1,0).getDate(); this.days.set([...Array(first).fill(null),...Array.from({length:total},(_,i)=>i+1)]); }
}
