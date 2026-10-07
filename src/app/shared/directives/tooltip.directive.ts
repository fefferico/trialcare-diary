import { Directive, ElementRef, HostListener, Renderer2, OnDestroy, input, inject } from '@angular/core';

let nextTooltipId = 0;

/** Directive that applies Tooltip behavior to elements. */
@Directive({
    selector: '[appTooltip]',
    standalone: true
})
export class TooltipDirective implements OnDestroy {
    readonly tooltipText = input('', { alias: "appTooltip" });
    readonly tooltipFontSize = input<string>('10px');
    readonly tooltipColor = input<string>('bg-gray-900/90'); // Default color with transparency
    readonly tooltipPosition = input<'top' | 'bottom' | 'left' | 'right' | null>(null);
    readonly tooltipTextColor = input<string | null>(null);
    readonly mobileBehavior = input<'hide' | 'modal'>('hide');

    private tooltipElement: HTMLElement | null = null;
    private timer: any;
    private readonly tooltipId = `app-tooltip-${++nextTooltipId}`;
    private originalDescribedBy: string | null = null;

    private el = inject(ElementRef);
    private renderer = inject(Renderer2);

    /** Helper to detect if the device supports hover (mouse) */
    private get supportsHover(): boolean {
        return typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
    }

    /** Performs the onMouseEnter operation. */
    @HostListener('mouseenter') onMouseEnter() {
        if (!this.supportsHover) return; // Only show on hover for devices with a mouse
        if (!this.tooltipText()) return;

        // Small delay to prevent flickering
        this.timer = setTimeout(() => {
            this.show();
        }, 150);
    }

    /** Performs the onMouseLeave operation. */
    @HostListener('mouseleave') onMouseLeave() {
        if (!this.supportsHover) return;
        if (this.timer) clearTimeout(this.timer);
        if (this.isFocused()) return;
        this.hide();
    }

    /** Shows the tooltip when the trigger receives keyboard focus. */
    @HostListener('focusin') onFocusIn() {
        if (!this.tooltipText()) return;
        this.show(true);
    }

    /** Hides the tooltip when focus leaves the trigger. */
    @HostListener('focusout', ['$event']) onFocusOut(event: FocusEvent) {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && this.el.nativeElement.contains(nextTarget)) return;
        this.hide();
    }

    /** Allows keyboard users to dismiss the tooltip without moving focus. */
    @HostListener('keydown.escape', ['$event']) onEscape(event: Event) {
        if (!this.tooltipElement) return;
        event.preventDefault();
        this.hide();
    }

    /** Toggles the tooltip on click, primarily for mobile devices. */
    @HostListener('click', ['$event']) onClick(event: Event) {
        // Case 1: If tooltip is already shown, hide it
        if (this.tooltipElement) {
            this.hide();
            return;
        }

        // Case 2: Handle touch-specific behavior
        if (!this.supportsHover) {
            if (this.mobileBehavior() === 'hide') return;

            event.stopPropagation();
            this.show(true); // Force show on click for touch devices
            return;
        }

        // Case 3: Desktop (Mouse) - Only show on click if modal behavior is requested
        if (this.mobileBehavior() === 'modal') {
            event.stopPropagation();
            this.show(true);
        }
    }

    /** Dismisses tooltip on external touch on mobile */
    @HostListener('document:touchstart', ['$event']) onTouchStart(event: Event) {
        if (!this.tooltipElement) return;

        const target = event.target as HTMLElement;
        const isTrigger = this.el.nativeElement.contains(target);
        const isTooltip = this.tooltipElement.contains(target);

        if (!isTrigger && !isTooltip) {
            this.hide();
        }
    }

    ngOnDestroy() {
        if (this.timer) clearTimeout(this.timer);
        this.hide();
    }

    private show(force = false) {
        if (typeof window === 'undefined') return;
        // Don't show on mobile/touch devices unless forced (by click)
        if (!force && window.innerWidth < 768) return;

        this.createTooltip();
        this.setPosition();
    }

    private hide() {
        if (this.timer) clearTimeout(this.timer);
        this.removeDescribedBy();

        if (this.tooltipElement) {
            this.renderer.addClass(this.tooltipElement, 'opacity-0');
            this.renderer.addClass(this.tooltipElement, 'translate-x-[-4px]');
            const el = this.tooltipElement;
            setTimeout(() => {
                if (el && el.parentNode) {
                    this.renderer.removeChild(document.body, el);
                }
            }, 200);
            this.tooltipElement = null;
        }
    }

    private createTooltip() {
        // Prevent multiple tips
        if (this.tooltipElement) return;

        this.tooltipElement = this.renderer.createElement('div');
        this.renderer.appendChild(document.body, this.tooltipElement!);

        // Set Text
        this.renderer.setProperty(this.tooltipElement, 'textContent', this.tooltipText());
        this.renderer.setAttribute(this.tooltipElement, 'id', this.tooltipId);
        this.renderer.setAttribute(this.tooltipElement, 'role', 'tooltip');
        this.addDescribedBy();

        // Apply Premium Styles
        this.renderer.addClass(this.tooltipElement, 'fixed');
        this.renderer.addClass(this.tooltipElement, 'z-[9999]');

        // Dynamic color or default
        const bgClasses = this.tooltipColor().split(' ');
        bgClasses.forEach(cls => this.renderer.addClass(this.tooltipElement!, cls));

        // Font Color: Manual priority, then smart detection
        const forcedTextColor = this.tooltipTextColor();
        if (forcedTextColor) {
            this.renderer.addClass(this.tooltipElement, forcedTextColor);
        } else {
            // Smart auto-color based on background
            const bgClass = this.tooltipColor().toLowerCase();
            const isLightBg = bgClass.includes('white') ||
                bgClass.includes('gray-50') ||
                bgClass.includes('gray-100') ||
                bgClass.includes('indigo-50') ||
                bgClass.includes('amber-50') ||
                bgClass.includes('emerald-50') ||
                bgClass.includes('yellow-');

            this.renderer.addClass(this.tooltipElement, isLightBg ? 'text-gray-900' : 'text-white');
        }

        this.renderer.setStyle(this.tooltipElement, 'font-size', this.tooltipFontSize());
        this.renderer.addClass(this.tooltipElement, 'font-bold');
        this.renderer.addClass(this.tooltipElement, 'py-1.5');
        this.renderer.addClass(this.tooltipElement, 'px-3');
        this.renderer.addClass(this.tooltipElement, 'rounded-lg');
        this.renderer.addClass(this.tooltipElement, 'shadow-xl');
        this.renderer.addClass(this.tooltipElement, 'pointer-events-none');
        this.renderer.addClass(this.tooltipElement, 'whitespace-pre-line');
        this.renderer.addClass(this.tooltipElement, 'max-w-[250px]');
        this.renderer.addClass(this.tooltipElement, 'backdrop-blur-md');

        // Initial state for animation
        this.renderer.addClass(this.tooltipElement, 'opacity-0');
        this.renderer.addClass(this.tooltipElement, 'translate-x-[-8px]');
        this.renderer.addClass(this.tooltipElement, 'transition-all');
        this.renderer.addClass(this.tooltipElement, 'duration-200');
        this.renderer.addClass(this.tooltipElement, 'ease-out');

        // Trigger entrance animation
        requestAnimationFrame(() => {
            if (this.tooltipElement) {
                this.renderer.removeClass(this.tooltipElement, 'opacity-0');
                this.renderer.removeClass(this.tooltipElement, 'translate-x-[-8px]');
                this.renderer.addClass(this.tooltipElement, 'translate-x-[0px]');
            }
        });
    }

    private isFocused(): boolean {
        return this.el.nativeElement === document.activeElement || this.el.nativeElement.contains(document.activeElement);
    }

    private addDescribedBy(): void {
        if (this.originalDescribedBy === null) {
            this.originalDescribedBy = this.el.nativeElement.getAttribute('aria-describedby');
        }

        const existingIds = (this.originalDescribedBy ?? '').split(/\s+/).filter(Boolean);
        if (!existingIds.includes(this.tooltipId)) {
            existingIds.push(this.tooltipId);
        }
        this.renderer.setAttribute(this.el.nativeElement, 'aria-describedby', existingIds.join(' '));
    }

    private removeDescribedBy(): void {
        if (this.originalDescribedBy === null) {
            this.renderer.removeAttribute(this.el.nativeElement, 'aria-describedby');
            return;
        }

        if (this.originalDescribedBy) {
            this.renderer.setAttribute(this.el.nativeElement, 'aria-describedby', this.originalDescribedBy);
        } else {
            this.renderer.removeAttribute(this.el.nativeElement, 'aria-describedby');
        }
    }

    private setPosition() {
        if (!this.tooltipElement) return;

        const hostPos = this.el.nativeElement.getBoundingClientRect();
        const tooltipPos = this.tooltipElement.getBoundingClientRect();

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const spacing = 10;

        let top = 0;
        let left = 0;
        const requestedPos = this.tooltipPosition();

        if (requestedPos) {
            // Forced position logic
            switch (requestedPos) {
                case 'top':
                    top = hostPos.top - tooltipPos.height - spacing;
                    left = hostPos.left + (hostPos.width - tooltipPos.width) / 2;
                    break;
                case 'bottom':
                    top = hostPos.bottom + spacing;
                    left = hostPos.left + (hostPos.width - tooltipPos.width) / 2;
                    break;
                case 'left':
                    top = hostPos.top + (hostPos.height - tooltipPos.height) / 2;
                    left = hostPos.left - tooltipPos.width - spacing;
                    break;
                case 'right':
                    top = hostPos.top + (hostPos.height - tooltipPos.height) / 2;
                    left = hostPos.right + spacing;
                    break;
            }
        } else {
            // Default logic: Right side center -> Flip to top if overflows -> Flip to bottom if top overflows
            top = hostPos.top + (hostPos.height - tooltipPos.height) / 2;
            left = hostPos.right + spacing;

            // Check if tooltip overflows right screen boundary
            if (left + tooltipPos.width > windowWidth - spacing) {
                // Priority 1: Place it on the top (centered) if overflowing right
                left = hostPos.left + (hostPos.width - tooltipPos.width) / 2;
                top = hostPos.top - tooltipPos.height - spacing;

                // Priority 2: If it overflows the top as well, put it at the bottom
                if (top < spacing) {
                    top = hostPos.bottom + spacing;
                }
            }
        }

        // Global boundary clamping for all cases (forced or not) to keep inside screen
        if (left < spacing) left = spacing;
        if (left + tooltipPos.width > windowWidth - spacing) left = windowWidth - tooltipPos.width - spacing;
        if (top < spacing) top = spacing;
        if (top + tooltipPos.height > windowHeight - spacing) top = windowHeight - tooltipPos.height - spacing;

        this.renderer.setStyle(this.tooltipElement, 'top', `${top}px`);
        this.renderer.setStyle(this.tooltipElement, 'left', `${left}px`);
    }
}
