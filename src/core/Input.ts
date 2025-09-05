import { PointerPoint } from "../types/types";

type Handlers = {
  onSingleStart: (p: PointerPoint) => void;
  onSingleMove: (p: PointerPoint) => void;
  onSingleEnd: () => void;

  onDualStart: (p1: PointerPoint, p2: PointerPoint) => void;
  onDualMove: (p1: PointerPoint, p2: PointerPoint) => void;
  onDualEnd: () => void;
};

export class Input {
  private el: HTMLElement;
  private handlers: Handlers;

  private pointers = new Map<number, PointerPoint>();
  private isDual = false;

  constructor(el: HTMLElement, handlers: Handlers) {
    this.el = el;
    this.handlers = handlers;

    // Non-passive to allow preventDefault
    el.addEventListener("pointerdown", this.onDown, { passive: false });
    el.addEventListener("pointermove", this.onMove, { passive: false });
    el.addEventListener("pointerup", this.onUp, { passive: false });
    el.addEventListener("pointercancel", this.onUp, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent) => {
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 1) {
      this.isDual = false;
      this.handlers.onSingleStart(p);
    } else if (this.pointers.size === 2) {
      this.isDual = true;
      const [p1, p2] = Array.from(this.pointers.values());
      this.handlers.onDualStart(p1, p2);
    }
  };

  private onMove = (e: PointerEvent) => {
    e.preventDefault();
    if (!this.pointers.has(e.pointerId)) return;
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, p);

    if (this.isDual && this.pointers.size >= 2) {
      const [p1, p2] = Array.from(this.pointers.values()).slice(0, 2);
      this.handlers.onDualMove(p1, p2);
    } else if (!this.isDual && this.pointers.size === 1) {
      this.handlers.onSingleMove(p);
    }
  };

  private onUp = (e: PointerEvent) => {
    e.preventDefault();
    this.pointers.delete(e.pointerId);

    if (this.isDual) {
      if (this.pointers.size < 2) {
        this.isDual = false;
        this.handlers.onDualEnd();
      }
    } else {
      if (this.pointers.size === 0) {
        this.handlers.onSingleEnd();
      }
    }
  };
}
