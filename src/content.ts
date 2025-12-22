class GhostOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private canvas: HTMLCanvasElement;

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
    this.host.style.width = '100vw';
    this.host.style.height = '100vh';
    // overlay above all
    this.host.style.zIndex = '2147483647';
    // Mouse pointer invisible till activated
    this.host.style.pointerEvents = 'none';

    // Set up canvas to full page
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    this.shadow.appendChild(this.canvas);
  }

  public mount() {
    if (!document.getElementById(this.host.id)) {
      document.body.appendChild(this.host);
      console.log('Ghost overlay injected');
    }
  }

  public activate() {
    // Mouse pointer to '+' sign
    this.host.style.pointerEvents = 'crosshair';
    // Get 2D drawing context for canvas
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.action === 'Qm_ACTIVATE_OVERLAY') {
    const overlay = new GhostOverlay();
    overlay.mount();
    overlay.activate();
  }
});
