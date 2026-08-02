import { RuntimeMessageAction } from './types';
import type {
  RuntimeMessage,
  SelectionRect,
  Point,
  EngineOption,
} from './types';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CSS = {
  bgAlpha: 0.4,
  stroke: '#ffffff',
  radius: 28,
  lineWidth: 3,
} as const;
const ID = 'xr-screenshot-reader-host';
/**
 * The structured engine can spend tens of seconds loading before SETUP_DONE
 * arrives, and the overlay dims the whole page for that entire window. Naming
 * the escape hatch in the banner is the difference between "waiting" and
 * "frozen" — see `mount()`, which binds Escape from the moment we go dark.
 */
const LOADING_TEXT = 'Loading model... (press Esc to cancel)';
/** How long the failure banner stays up before the overlay tears itself down. */
const FAILURE_LINGER_MS = 4000;
const ICON = `<svg viewBox="3 -0.375 18 21" fill="none" width="24" height="24"><path stroke="#4285f4" stroke-width="1.7143125" d="M6.857 4.286H17.143a2.571 2.571 0 0 1 2.571 2.571v6.857A2.571 2.571 0 0 1 17.143 16.286H6.857a2.571 2.571 0 0 1 -2.571 -2.571V6.857a2.571 2.571 0 0 1 2.571 -2.571z"/><path fill="#b1caf5" d="M16.971 10.286a4.286 4.286 0 0 1 -4.286 4.286A4.286 4.286 0 0 1 8.4 10.286a4.286 4.286 0 0 1 8.571 0M6.686 0.857h3.771a0.686 0.686 0 0 1 0.686 0.686v0.514a0.686 0.686 0 0 1 -0.686 0.686H6.686A0.686 0.686 0 0 1 6 2.057V1.543a0.686 0.686 0 0 1 0.686 -0.686"/></svg>`;

/**
 * Darkens the user's screen, prompts them to click & drag a rectangle, then
 * hands the resulting SelectionRect to `onSelection`.
 *
 * The overlay lives in the content script's own context, so the selection is
 * delivered by direct call. It used to round-trip content -> service worker ->
 * content via CAPTURE_SUCCESS purely to reach a function in the same module
 * graph.
 */
export class GhostOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private backupMode: boolean;
  private engine: EngineOption;
  private notificationBanner: HTMLDivElement;
  private onSelection: (rect: SelectionRect) => void;
  private onDestroy?: () => void;

  private isDragging = false;
  private startPos: Point = { x: 0, y: 0 };
  private currentPos: Point = { x: 0, y: 0 };
  private bgAlpha = 0;
  private destroyed = false;
  private failureTimer: number | null = null;

  constructor(
    overlayStyles: string,
    backupMode: boolean,
    engine: EngineOption,
    onSelection: (rect: SelectionRect) => void,
    onDestroy?: () => void,
  ) {
    this.onSelection = onSelection;
    this.onDestroy = onDestroy;
    console.debug('[Overlay]: Initiate overlay for screenshot rect');
    this.host = document.createElement('div');
    this.host.id = ID;
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.initStructure(overlayStyles);

    this.backupMode = backupMode;
    this.engine = engine;
    this.notificationBanner = document.createElement('div');
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
   * Create notification banner, only show for thinking engine
   */
  private initNotificationUI(): void {
    console.debug('[Overlay]: Create notification banner');

    this.notificationBanner.className = 'banner';

    const lenIcon = document.createElement('div');
    lenIcon.innerHTML = ICON;
    lenIcon.className = 'icon';

    const bannerText = document.createElement('span');

    if (this.engine === 'fast')
      bannerText.textContent = `Click and drag to extract text`;
    else bannerText.textContent = LOADING_TEXT;

    this.notificationBanner.appendChild(lenIcon);
    this.notificationBanner.appendChild(bannerText);
    this.shadow.appendChild(this.notificationBanner);
  }

  /** Mount overlay on screen if not already */
  public mount(): void {
    console.debug('[Overlay]: Mount overlay on screen');
    if (!document.getElementById(ID)) {
      document.body.appendChild(this.host);
    }

    this.host.style.pointerEvents = 'none';
    this.resizeCanvas();
    window.addEventListener('resize', this.handleResize);

    // Escape is bound HERE, not in activate(). Everything between mount() and
    // SETUP_DONE is time the user spends staring at a darkened page, and if
    // setup never finishes — the offscreen document throws, the service worker
    // is torn down, a model file is unreadable — activate() is never called.
    // Binding the only dismissal path behind that message is what turned an
    // engine-load failure into a page the user could not un-darken.
    window.addEventListener('keydown', this.handleKeyDown);

    if (this.engine === 'fast') return;
    this.fillBackground(0.4);
  }

  private handleResize = (): void => {
    console.debug('[Overlay] Resize canvas on window resize');
    this.resizeCanvas();
    this.draw();
  };

  private resizeCanvas(): void {
    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
  }

  public loadingProgress(progress: number): void {
    if (this.destroyed) return;
    const bannerText = this.notificationBanner.querySelector('span');
    if (!bannerText) return;
    bannerText.textContent = `Loading model ${progress}% (press Esc to cancel)`;
  }

  /** Enables '+' mouse, listen to mousedown. Escape is already live from mount(). */
  public activate(): void {
    if (this.destroyed) return;
    console.debug('[Overlay] Enables + mouse, listen to mousedown');
    this.host.style.pointerEvents = 'auto';
    this.canvas.addEventListener('mousedown', this.startFade, { once: true });
    this.canvas.addEventListener('mousedown', this.handleMouseDown);

    const bannerText = this.notificationBanner.querySelector('span');
    if (!bannerText) return;
    bannerText.textContent = `Click and drag to extract text`;

    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    const flash = document.createElement('div');
    flash.className = 'flash-effect';
    this.shadow.appendChild(flash);

    flash.addEventListener(
      'animationend',
      () => {
        flash.remove();
      },
      { once: true },
    );
  }

  /**
   * Engine setup failed (or the port died) before the overlay was ever usable.
   *
   * Clear the darkening immediately so the page is readable again, say why, and
   * tear down shortly after. The overlay has nothing left to do — there is no
   * engine to send a selection to — so lingering silently is the one thing it
   * must not do.
   */
  public setupFailed(reason?: string): void {
    if (this.destroyed) return;
    console.debug('[Overlay] setup failed, releasing the page:', reason);

    this.bgAlpha = 0;
    this.fillBackground(0);

    const bannerText = this.notificationBanner.querySelector('span');
    if (bannerText) {
      bannerText.textContent = 'Could not load the OCR engine. Please retry.';
    }

    this.failureTimer = window.setTimeout(() => {
      this.failureTimer = null;
      this.destroy();
    }, FAILURE_LINGER_MS);
  }

  /** True once the overlay has torn itself down (Escape, selection, failure). */
  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    console.debug('[Overlay] remove listener, "escape" keydown, & box');
    if (this.failureTimer !== null) {
      window.clearTimeout(this.failureTimer);
      this.failureTimer = null;
    }
    if (this.notificationBanner) this.notificationBanner.remove();
    this.canvas.removeEventListener('mousedown', this.startFade);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    this.host.remove();
    // Runs last, and only once: `destroyed` is already set, so a callback that
    // loops back into the overlay cannot re-enter this teardown.
    this.onDestroy?.();
  }

  /**
   * Upon mousedown:
   * - listen to 'mousemove' to update white rectangle
   * - listen to 'mouseup' to capture SelectionRect & send to background
   */
  private handleMouseDown = async (e: MouseEvent) => {
    this.notificationBanner.remove();
    if (this.backupMode) {
      await chrome.runtime.sendMessage<RuntimeMessage>({
        action: RuntimeMessageAction.CAPTURE_VISIBLE_TAB,
      });
    }

    this.isDragging = true;
    this.startPos = { x: e.clientX, y: e.clientY };
    this.currentPos = { x: e.clientX, y: e.clientY };
    e.preventDefault();

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  };

  /**
   * Dark background fade in for 300ms, then stay at 0.4
   */
  private startFade = (): void => {
    const fadeStart = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - fadeStart) / 300, 1);
      this.bgAlpha = t * CSS.bgAlpha;
      this.draw();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.currentPos = { x: e.clientX, y: e.clientY };
    this.draw();
  };

  /** Check rect, hand it to the content script, destroy */
  private handleMouseUp = (): void => {
    console.debug('[Overlay] on mouseup, check rect, emit selection, destroy');
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    const rect = this.getSelectionRect();

    if (rect.width > 5 && rect.height > 5) {
      console.debug('Image captured:', rect);
      this.onSelection(rect);
    }
    this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    console.debug('[Overlay] destroy on "Escape"');
    this.destroy();
  };

  /**
   * Draw a google lens style rectangular with 1 sharp coner.
   * Update bubble position
   */
  private draw(): void {
    if (!this.ctx) return;
    this.fillBackground();

    if (!this.isDragging && this.startPos.x === 0) return;

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

  private fillBackground(bgAlpha?: number): void {
    if (!this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    const alpha = bgAlpha ?? this.bgAlpha;
    this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
  }
}
