import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'highlight',
  standalone: true,
})
export class HighlightPipe implements PipeTransform {
  transform(value: string | null | undefined, searchTerm: string | null | undefined): string {
    if (!value) return '';

    const terms = this.normalize(searchTerm ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!terms.length) return this.escapeHtml(value);

    const ranges: Array<{ start: number; end: number }> = [];
    for (const word of value.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
      const normalizedWord = this.normalize(word[0]);
      if (terms.some((term) => this.matches(term, normalizedWord))) {
        const start = word.index ?? 0;
        ranges.push({ start, end: start + word[0].length });
      }
    }

    if (!ranges.length) return this.escapeHtml(value);

    const markerClass = 'rounded bg-amber-200 px-0.5 text-slate-950 dark:bg-amber-400';
    let result = '';
    let cursor = 0;
    for (const range of ranges) {
      result += this.escapeHtml(value.slice(cursor, range.start));
      result += `<mark class="${markerClass}">${this.escapeHtml(value.slice(range.start, range.end))}</mark>`;
      cursor = range.end;
    }
    return result + this.escapeHtml(value.slice(cursor));
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim();
  }

  private matches(term: string, word: string): boolean {
    if (word.includes(term) || word.startsWith(term)) return true;
    const maxDistance = term.length < 4 ? 0 : term.length < 7 ? 1 : 2;
    return maxDistance > 0 && Math.abs(word.length - term.length) <= maxDistance &&
      this.editDistance(term, word) <= maxDistance;
  }

  private editDistance(left: string, right: string): number {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i++) {
      const current = [i];
      for (let j = 1; j <= right.length; j++) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[right.length];
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  }
}
