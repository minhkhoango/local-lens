import type { Point } from '../types';
import { CLASSES } from './constants';

type DragCallback = (pos: Point) => void;
type EventCallbacks = {
  onDestroy: () => void;
  onReposition: (pos: Point) => void;
  getCurrentPosition: () => Point;
};

/**
 * Handle the full dragging life cycle of island
 */
export class DragController {
  private isDragging = false;
  private dragOffset: Point = { x: 0, y: 0 };
  private onMove: DragCallback;

  constructor(onMove: DragCallback) {
    this.onMove = onMove;
  }

  /**
   * Visually updating the position of the floatingIsland
   * @param e Listens to 'mousemove' and 'mouseup' for stop
   * @param currentPos Island's top left corner
   */
  public start(e: MouseEvent, currentPos: Point): void {
    const nonDraggableSelectors = [
      CLASSES.btn,
      CLASSES.toggle,
      CLASSES.textarea,
      CLASSES.preview,
      CLASSES.settingsSelect,
      CLASSES.selectWrapper,
      CLASSES.settingsActionBtn,
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

  /**
   * Stop dragging, remove mouse listener
   */
  public destroy(): void {
    this.handleEnd();
  }
}

/**
 * Listen to mousedown & keyboard 'Escape' to remove island
 * Ensure natural position of island on tab resize, zoom in / out
 */
export class EventsController {
  private viewportSize: { width: number; height: number };
  private hostElement: HTMLDivElement;
  private onDestroy: () => void;
  private onReposition: (pos: Point) => void;
  private getCurrentPosition: () => Point;

  constructor(hostElement: HTMLDivElement, callbacks: EventCallbacks) {
    this.hostElement = hostElement;
    this.onDestroy = callbacks.onDestroy;
    this.onReposition = callbacks.onReposition;
    this.getCurrentPosition = callbacks.getCurrentPosition;
    this.viewportSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /**
   * Add 'mousedown', 'keydown', and 'resize' listener
   * and their destroy / update positioning logic
   */
  public attach(): void {
    document.addEventListener('mousedown', this.handleClickOutside);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
  }

  private handleClickOutside = (e: MouseEvent): void => {
    if (!this.hostElement.contains(e.target as Node)) {
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

    // Get current position from source of truth
    const currentPos = this.getCurrentPosition();

    // Scale position proportionally
    const scaledPos: Point = {
      x: currentPos.x * scaleX,
      y: currentPos.y * scaleY,
    };

    this.onReposition(scaledPos);
    this.viewportSize = { width: innerWidth, height: innerHeight };
  };

  /**
   * Remove 'mousedown', 'keydown', and 'resize' listener
   */
  public destroy(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
  }
}
