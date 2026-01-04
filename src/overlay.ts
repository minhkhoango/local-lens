import { IDS, CONFIG, OVERLAY_CSS } from './constants';
import { ExtensionAction } from './types';
import type { ExtensionMessage, SelectionRect, Point } from './types';

export class GhostOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  private isDragging = false;
  private startPos: Point = { x: 0, y: 0 };
  private currentPos: Point = { x: 0, y: 0 };

  constructor() {
    console.debug('[Overlay]: Initiate overlay for screenshot rect');
    this.host = document.createElement('div');
    this.host.id = IDS.OVERLAY;
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.canvas = document.createElement('canvas');
    this.initStructure();
  }

  private initStructure(): void {
    console.debug('[Overlay]: Create top level gray darkening, match dpr');
    Object.assign(this.host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: OVERLAY_CSS.layout.zIndex,
      pointerEvents: 'none', // Pass-through
    });

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;

    Object.assign(this.canvas.style, {
      width: '100%',
      height: '100%',
      cursor: OVERLAY_CSS.animation.cursor,
    });

    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) this.ctx.scale(dpr, dpr);
    this.shadow.appendChild(this.canvas);
  }

  public mount(): void {
    console.debug('[Overlay]: Mount overlay on screen');
    if (!document.getElementById(IDS.OVERLAY)) {
      document.body.appendChild(this.host);
    }
  }

  public activate(): void {
    console.debug('[Overlay] Enables + mouse, listen to mousedown');
    this.host.style.pointerEvents = 'auto';
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('keydown', this.handleKeyDown);
    this.draw();
  }

  public destroy(): void {
    console.debug('[Overlay] remove listener, "escape" keydown, & box');
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.host.remove();
  }

  private handleMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.startPos = { x: e.clientX, y: e.clientY };
    this.currentPos = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    // document > this.canvas for mouse release outside tab
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    this.draw();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.currentPos = { x: e.clientX, y: e.clientY };
    this.draw();
  };

  private handleMouseUp = (_e: MouseEvent): void => {
    console.debug(
      '[Overlay] on mouseup, check rect, send image to BG, destroy'
    );
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    const rect = this.getSelectionRect();

    if (
      rect.width > CONFIG.MIN_SELECTION_ZX &&
      rect.height > CONFIG.MIN_SELECTION_ZY
    ) {
      console.debug('Image captured:', rect);
      chrome.runtime.sendMessage<ExtensionMessage>({
        action: ExtensionAction.CAPTURE_SUCCESS,
        payload: rect,
      });
    }
    this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    console.debug('[Overlay] destroy on "Escape"');
    if (e.key === 'Escape') this.destroy();
  };

  private draw(): void {
    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    this.ctx.fillStyle = OVERLAY_CSS.colors.bg;
    this.ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    if (this.isDragging || this.startPos.x !== 0) {
      const { x, y, width, height } = this.getSelectionRect();
      this.ctx.clearRect(x, y, width, height);
      this.ctx.strokeStyle = OVERLAY_CSS.colors.stroke;
      this.ctx.lineWidth = OVERLAY_CSS.animation.lineWidth;
      this.ctx.strokeRect(x, y, width, height);
    }
  }

  private getSelectionRect(): SelectionRect {
    // Clamp viewport boundaries when mouse leaves window
    const clampedCurrentPos: Point = {
      x: Math.max(0, Math.min(this.currentPos.x, window.innerWidth)),
      y: Math.max(0, Math.min(this.currentPos.y, window.innerHeight)),
    };

    return {
      x: Math.min(this.startPos.x, clampedCurrentPos.x),
      y: Math.min(this.startPos.y, clampedCurrentPos.y),
      width: Math.abs(this.startPos.x - clampedCurrentPos.x),
      height: Math.abs(this.startPos.y - clampedCurrentPos.y),
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }
}
