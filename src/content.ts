interface Point {
  x: number;
  y: number;
}

class GhostOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;

  private isDragging: boolean = false;
  private startPos: Point = { x: 0, y: 0 };
  private currentPos: Point = { x: 0, y: 0 };

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'xr-screenshot-reader-host';

    try {
      // Attach a closed Shadow DOM inaccessible to outside code
      this.shadow = this.host.attachShadow({ mode: 'closed' });
    } catch (err) {
      console.warn('Shadow DOM blocked by host CSP. Fallback');
      throw err;
    }

    this.canvas = document.createElement('canvas');
    this.initStructure();
  }

  public initStructure() {
    this.host.style.position = 'fixed';
    this.host.style.top = '0';
    this.host.style.left = '0';
    // 1vw=1% viewwidth, visible area of webpage
    this.host.style.width = '100vw';
    this.host.style.height = '100vh';
    // overlay above all
    this.host.style.zIndex = '2147483647';
    // Allow click to passthrough
    this.host.style.pointerEvents = 'none';

    // Set internal res to match window, if not, draw offscreen
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // High-DPI: Scale internal resolution
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;

    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    this.shadow.appendChild(this.canvas);
  }

  public mount() {
    if (!document.getElementById(this.host.id)) {
      document.body.appendChild(this.host);
      console.log('Ghost overlay injected');
    }
  }

  public destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.host.remove();
  }

  public activate() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);

    window.addEventListener('keydown', this.handleKeyDown);
    // Allow clicks
    this.host.style.pointerEvents = 'auto';
    // Mouse pointer to '+' sign
    this.host.style.cursor = 'crosshair';
    this.draw();
  }

  private handleMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    this.startPos = { x: e.clientX, y: e.clientY };
    this.currentPos = { x: e.clientX, y: e.clientY };
    e.preventDefault(); // stop text selection
    this.draw();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;

    this.currentPos = { x: e.clientX, y: e.clientY };
    this.draw();
  };

  private handleMouseUp = (_e: MouseEvent): void => {
    this.isDragging = false;

    // Capture data before destroy UI
    const selection = this.getSelectionRect();
    if (selection.w > 5 && selection.h > 5) {
      console.log('Capture Zone:', selection);
      // Next Phase
    }

    this.destroy();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key == 'Escape') {
      this.destroy();
    }
  };

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    if (this.isDragging || this.startPos.x !== 0) {
      // Cut the rectangular hole
      const { x, y, w, h } = this.getSelectionRect();
      ctx.clearRect(x, y, w, h);

      // Polish: Draw a boarder around selection
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
  }

  private getSelectionRect() {
    const x = Math.min(this.startPos.x, this.currentPos.x);
    const y = Math.min(this.startPos.y, this.currentPos.y);
    const w = Math.abs(this.startPos.x - this.currentPos.x);
    const h = Math.abs(this.startPos.y - this.currentPos.y);

    return { x, y, w, h };
  }
}

let activeOverlay: GhostOverlay | null = null;

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.action === 'Qm_ACTIVATE_OVERLAY') {
    if (activeOverlay) {
      activeOverlay.destroy();
    }

    activeOverlay = new GhostOverlay();
    activeOverlay.mount();
    activeOverlay.activate();
  }
});
