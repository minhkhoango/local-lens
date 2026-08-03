import type { Point } from '../types';
import { CLASS } from './constants';

type DragCallback = (pos: Point) => void;
type EventCallbacks = {
  onDestroy: () => void;
  onReposition: (pos: Point) => void;
  getCurrentPosition: () => Point;
};

/** Handle the full dragging life cycle of island */
export class DragController {
  private isDragging = false;
  private dragOffset: Point = { x: 0, y: 0 };
  private onMove: DragCallback;

  constructor(onMove: DragCallback) {
    this.onMove = onMove;
  }

  /** Visually updating the position of the floatingIsland */
  public start(e: MouseEvent, currentPos: Point): void {
    const nonDraggableSelectors = [
      CLASS.BTN.btn,
      CLASS.STATE.toggleActive,
      CLASS.MAIN.textarea,
      CLASS.MAIN.preview,
      CLASS.SETTINGS.select,
      CLASS.BTN.shortcut,
    ]
      .map((c) => `.${c}`)
      .join(', ');

    const target = e.target as HTMLElement;
    if (target.closest(nonDraggableSelectors)) return;

    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - currentPos.x,
      y: e.clientY - currentPos.y,
    };

    document.addEventListener('mousemove', this.handleMove);
    document.addEventListener('mouseup', this.handleEnd);
    e.preventDefault();
    e.stopPropagation();
  }

  private handleMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const newPos = {
      x: e.clientX - this.dragOffset.x,
      y: e.clientY - this.dragOffset.y,
    };
    this.onMove(newPos);
  };

  private handleEnd = (): void => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('mouseup', this.handleEnd);
  };

  public destroy(): void {
    this.handleEnd();
  }
}

/**
 * True when the top-level document is one Chrome renders with a plugin — its
 * built-in PDF viewer being the only one that matters here.
 *
 * The viewer is a single <embed type="application/pdf"> whose plugin runs in
 * its own process, and every mouse and key event that lands inside it stays
 * there. None of the dismissal listeners below can ever see them.
 *
 * The caller's `isPdf` comes from `background.ts` classifyUrl(), which decides
 * by filename suffix. A PDF served from `/report`, `/download?id=…`, or any
 * Content-Disposition response is classified as not-a-PDF, and the island then
 * attaches zero working dismissal paths. Chrome sets `document.contentType` to
 * 'application/pdf' for the viewer regardless of the URL, so ask the document.
 */
export function isPluginDocument(): boolean {
  return (
    document.contentType === 'application/pdf' ||
    document.querySelector('embed[type="application/pdf"]') !== null
  );
}

/**
 * Listen to mousedown & keyboard 'Escape' to remove island
 * Ensure natural position of island on tab resize, zoom in / out
 */
export class EventsController {
  private viewportSize: { width: number; height: number };
  private hostElement: HTMLDivElement;
  private isPdf: boolean;

  private onDestroy: () => void;
  private onReposition: (pos: Point) => void;
  private getCurrentPosition: () => Point;

  constructor(
    hostElement: HTMLDivElement,
    isPdf: boolean,
    callbacks: EventCallbacks,
  ) {
    this.hostElement = hostElement;
    // Trust the document over the URL: the filename sniff misses every PDF
    // served without a .pdf path, and those are exactly the pages where the
    // island had no way to be dismissed at all.
    this.isPdf = isPdf || isPluginDocument();

    this.onDestroy = callbacks.onDestroy;
    this.onReposition = callbacks.onReposition;
    this.getCurrentPosition = callbacks.getCurrentPosition;
    this.viewportSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /** Add listeners for mousedown, 'Escape' keydown, window resize */
  public attach(): void {
    document.addEventListener('mousedown', this.handleClickOutside);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
    // For PDF pages: Chrome's PDF viewer captures mouse events internally
    // and doesn't propagate them to document. We detect this via window blur.
    //
    // This is a fallback, not a guarantee — it fires when the plugin takes
    // focus, which is not the same thing as the user wanting the island gone.
    // The island's close button is the dismissal path that always works.
    if (this.isPdf) window.addEventListener('blur', this.handleWindowBlur);
  }

  /** Whether this controller decided it is running on a plugin-hosted page. */
  public get treatsPageAsPdf(): boolean {
    return this.isPdf;
  }

  private handleClickOutside = (e: MouseEvent): void => {
    if (!this.hostElement.contains(e.target as Node)) {
      this.onDestroy();
    }
  };

  /**
   * Handles window blur to detect clicks on embedded content (like PDF viewers)
   * that don't propagate mouse events to the document.
   *
   * Status: Does not delete island when clicked in new tab / side-to-side next to search bar (good!)
   * However, if we were to click on another app's tab / another app icon, island still disspear
   */
  private handleWindowBlur = (): void => {
    const { x, y } = this.getCurrentPosition();
    const inViewport =
      x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;

    if (inViewport) {
      this.onDestroy();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.onDestroy();
    }
  };

  private handleResize = (): void => {
    const { innerWidth, innerHeight } = window;
    const { width: prevWidth, height: prevHeight } = this.viewportSize;

    // For very first resize
    if (prevWidth === 0 || prevHeight === 0) {
      this.viewportSize = { width: innerWidth, height: innerHeight };
      return;
    }

    const scaleX = innerWidth / prevWidth;
    const scaleY = innerHeight / prevHeight;

    // Bail out on odd browser behavior
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
      this.viewportSize = { width: innerWidth, height: innerHeight };
      return;
    }

    const currentPos = this.getCurrentPosition();
    const scaledPos: Point = {
      x: currentPos.x * scaleX,
      y: currentPos.y * scaleY,
    };

    this.onReposition(scaledPos);
    this.viewportSize = { width: innerWidth, height: innerHeight };
  };

  public destroy(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    if (this.isPdf) window.removeEventListener('blur', this.handleWindowBlur);
  }
}
