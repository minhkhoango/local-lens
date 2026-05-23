import { vi } from 'vitest';

type ChromeShim = {
  i18n: { getMessage: (key: string, ...rest: unknown[]) => string };
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
    };
  };
  runtime: {
    sendMessage: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    getURL: (path: string) => string;
    onMessage: { addListener: ReturnType<typeof vi.fn> };
  };
};

export interface MockPort {
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onMessage: { addListener: ReturnType<typeof vi.fn> };
  onDisconnect: { addListener: ReturnType<typeof vi.fn> };
}

export function createMockPort(): MockPort {
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
  };
}

export function installChromeShim(): ChromeShim {
  const store = new Map<string, unknown>();

  const shim: ChromeShim = {
    i18n: {
      getMessage: (key: string) => key,
    },
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
          if (keys == null) {
            const out: Record<string, unknown> = {};
            for (const [k, v] of store) out[k] = v;
            return out;
          }
          if (typeof keys === 'string') {
            return store.has(keys) ? { [keys]: store.get(keys) } : {};
          }
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (store.has(k)) out[k] = store.get(k);
            return out;
          }
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(keys)) {
            out[k] = store.has(k) ? store.get(k) : v;
          }
          return out;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) store.delete(k);
        }),
        clear: vi.fn(async () => store.clear()),
      },
    },
    runtime: {
      sendMessage: vi.fn(async () => undefined),
      connect: vi.fn(() => createMockPort()),
      getURL: (path: string) => `/${path.replace(/^\//, '')}`,
      onMessage: { addListener: vi.fn() },
    },
  };

  (globalThis as any).chrome = shim;

  // Stub navigator.clipboard.write — JSDOM/playwright don't expose ClipboardItem cleanly.
  if (!(navigator as any).clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: vi.fn(async () => undefined), writeText: vi.fn(async () => undefined) },
    });
  } else {
    (navigator as any).clipboard.write = vi.fn(async () => undefined);
    (navigator as any).clipboard.writeText = vi.fn(async () => undefined);
  }

  if (typeof (globalThis as any).ClipboardItem === 'undefined') {
    class FakeClipboardItem {
      constructor(public items: Record<string, Blob>) {}
    }
    (globalThis as any).ClipboardItem = FakeClipboardItem;
  }

  return shim;
}

export function uninstallChromeShim(): void {
  delete (globalThis as any).chrome;
}
