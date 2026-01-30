import { ExtensionAction } from './types';
import type { ExtensionMessage, SelectionRect, Point } from './types';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CSS = {
  bg: 'rgba(0, 0, 0, 0.4)',
  stroke: '#ffffff',
  radius: 28,
  lineWidth: 3,
} as const;
const ID = 'xr-screenshot-reader-host';
const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="4"/><path d="M5 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/></svg>`;

/**
 * Darkens user's screen, prompt user to click & drag to create a rectangle,
 * then send the result to background message NOTIFY_CAPTURE_SUCCESS
 * to forward to content
 */
export class GhostOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  private notificationBanner: HTMLDivElement;
  private cursorBubble: HTMLDivElement;

  private isDragging = false;
  private startPos: Point = { x: 0, y: 0 };
  private currentPos: Point = { x: 0, y: 0 };

  constructor(overlayStyles: string) {
    console.debug('[Overlay]: Initiate overlay for screenshot rect');
    this.host = document.createElement('div');
    this.host.id = ID;
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.initStructure(overlayStyles);

    this.notificationBanner = document.createElement('div');
    this.cursorBubble = document.createElement('div');
    this.initNotificationUI();
  }

  /**
   * Create dpr scaled, gray overlay div
   */
  private initStructure(overlayStyles: string): void {
    console.debug('[Overlay]: Create top level gray darkening, match dpr');

    const style = document.createElement('style');
    style.textContent = overlayStyles;
    this.shadow.appendChild(style);

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.className = 'canvas';

    if (!this.ctx) return;
    this.ctx.scale(dpr, dpr);
    this.shadow.appendChild(this.canvas);
  }

  /**
   * Create notification banner and cursor bubble UI elements
   */
  private initNotificationUI(): void {
    console.debug('[Overlay]: Create notification banner and cursor bubble');

    this.notificationBanner.className = 'banner';

    const lenIcon = document.createElement('div');
    lenIcon.innerHTML = ICON;
    lenIcon.className = 'icon';

    const bannerText = document.createElement('span');
    bannerText.textContent = 'Click and drag to extract text';

    this.notificationBanner.appendChild(lenIcon);
    this.notificationBanner.appendChild(bannerText);
    this.shadow.appendChild(this.notificationBanner);

    this.cursorBubble.className = 'cursor-bubble';

    const bubbleIcon = document.createElement('div');
    bubbleIcon.innerHTML = ICON;
    bubbleIcon.className = 'icon';

    this.cursorBubble.appendChild(bubbleIcon);
    this.shadow.appendChild(this.cursorBubble);
  }

  /** Mount overlay on screen if not already */
  public mount(): void {
    console.debug('[Overlay]: Mount overlay on screen');
    if (!document.getElementById(ID)) {
      document.body.appendChild(this.host);
    }
  }

  /** Enables '+' mouse, listen to mousedown and 'Escape' */
  public activate(): void {
    console.debug('[Overlay] Enables + mouse, listen to mousedown');
    this.host.style.pointerEvents = 'auto';
    this.canvas.addEventListener('mouseenter', this.handleBubbleMove, {
      once: true,
    });
    this.canvas.addEventListener('mousemove', this.handleBubbleMove);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('keydown', this.handleKeyDown);

    this.draw();
  }

  public destroy(): void {
    console.debug('[Overlay] remove listener, "escape" keydown, & box');
    if (this.notificationBanner) this.notificationBanner.remove();
    this.cursorBubble.remove();
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleBubbleMove);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.host.remove();
  }

  /**
   * Upon mousedown:
   * - listen to 'mousemove' to update white rectangle
   * - listen to 'mouseup' to capture SelectionRect & send to background
   */
  private handleMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.startPos = { x: e.clientX, y: e.clientY };
    this.currentPos = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    // document > this.canvas for mouse release outside tab
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    this.notificationBanner.remove();
    this.draw();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.currentPos = { x: e.clientX, y: e.clientY };
    this.draw();
  };

  /** Check rect, send image to BG, destroy */
  private handleMouseUp = (): void => {
    console.debug(
      '[Overlay] on mouseup, check rect, send image to BG, destroy',
    );
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    const rect = this.getSelectionRect();

    if (rect.width > 5 && rect.height > 5) {
      console.debug('Image captured:', rect);
      chrome.runtime.sendMessage<ExtensionMessage>({
        action: ExtensionAction.NOTIFY_CAPTURE_SUCCESS,
        payload: rect,
      });
    }
    this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    console.debug('[Overlay] destroy on "Escape"');
    if (e.key === 'Escape') this.destroy();
  };

  /**
   * Draw a google lens style rectangular with 1 sharp coner.
   * Update bubble position
   */
  private draw(): void {
    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    this.ctx.fillStyle = CSS.bg;
    this.ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    if (this.isDragging || this.startPos.x !== 0) {
      const { x, y, width, height } = this.getSelectionRect();
      const r = Math.min(CSS.radius, width / 3, height / 3);
      const corner = this.getActiveCorner();

      this.ctx.beginPath();

      const radii = [r, r, r, r];
      if (corner === 'top-left') radii[0] = 0;
      if (corner === 'top-right') radii[1] = 0;
      if (corner === 'bottom-right') radii[2] = 0;
      if (corner === 'bottom-left') radii[3] = 0;

      this.ctx.roundRect(x, y, width, height, radii);

      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.fillStyle = 'black';
      this.ctx.fill();

      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = CSS.stroke;
      this.ctx.lineWidth = CSS.lineWidth;
      this.ctx.stroke();
    }
  }

  private handleBubbleMove = (e: MouseEvent): void => {
    this.cursorBubble.style.left = `${e.clientX + 6}px`;
    this.cursorBubble.style.top = `${e.clientY + 6}px`;
  };

  private getActiveCorner(): Corner {
    const draggingRight = this.currentPos.x >= this.startPos.x;
    const draggingDown = this.currentPos.y >= this.startPos.y;

    if (draggingRight && draggingDown) return 'bottom-right';
    if (draggingRight && !draggingDown) return 'top-right';
    if (!draggingRight && draggingDown) return 'bottom-left';
    return 'top-left';
  }

  /**
   * The payload of overlay, with bounded coordinates
   */
  private getSelectionRect(): SelectionRect {
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
