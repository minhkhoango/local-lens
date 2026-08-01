import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createElement, createRef } from 'react';
import islandStyles from '../styles/island.css?inline';
import { RuntimeMessageAction } from '../types';
import type {
  DownloadProgress,
  EngineOption,
  ErrorPayload,
  Point,
  ProgressPayload,
  ResultPayload,
  RuntimeMessage,
  Settings,
} from '../types';
import {
  FloatingIsland as FloatingIslandComponent,
  type IslandHandle,
} from './FloatingIsland';
import type { State } from './types';

const ID = 'xr-floating-island-host';

/**
 * Imperative wrapper around the React component. Preserves the public API
 * that `content.ts` consumed from the old vanilla implementation.
 */
export class FloatingIsland {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private root: Root;
  private handleRef = createRef<IslandHandle>();

  constructor(
    cursorPosition: Point,
    imageUrl: string,
    isPdf: boolean,
    webgpuSupported: boolean,
    onEngineChange: (engine: EngineOption) => Promise<void>,
  ) {
    console.debug('[Island.mount] constructor');
    this.host = document.createElement('div');
    this.host.id = ID;
    // Focusable but not tab-reachable — see the focus call in mount().
    this.host.tabIndex = -1;
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = islandStyles;
    this.shadow.appendChild(style);

    const mountPoint = document.createElement('div');
    this.shadow.appendChild(mountPoint);

    this.root = createRoot(mountPoint);
    // Render synchronously so `handleRef` is populated by the time the
    // constructor returns. Every method below is a no-op while the ref is null,
    // and callers legitimately update the island in the same turn they build it
    // — content.ts reports a failed capture immediately after mount(). With a
    // concurrent render those updates landed before React had committed and
    // were dropped, leaving a blank island.
    flushSync(() => {
      this.root.render(
        createElement(FloatingIslandComponent, {
          ref: this.handleRef,
          cursorPosition,
          imageUrl,
          isPdf,
          webgpuSupported,
          onDestroy: () => void this.destroy(),
          onEngineChange,
        }),
      );
    });
  }

  public mount(): void {
    if (!document.getElementById(ID)) {
      document.documentElement.appendChild(this.host);
    }
    // Pull keyboard focus out of whatever subframe had it — Chrome's PDF viewer
    // plugin above all. Key events only reach the focused frame, so without
    // this the island's Escape handler never fires on a PDF and the island
    // cannot be dismissed. It also re-focuses the document, which is what
    // `navigator.clipboard.write` requires: auto-copy silently no-ops while a
    // plugin frame holds focus.
    this.host.focus({ preventScroll: true });
  }

  public updateDownload(payload: DownloadProgress): void {
    this.handleRef.current?.updateDownload(payload);
  }

  public updateProgress(payload: ProgressPayload): void {
    this.handleRef.current?.updateProgress(payload);
  }

  public updateError(payload: ErrorPayload): void {
    this.handleRef.current?.updateError(payload);
  }

  public updateFinish(result: ResultPayload): void {
    this.handleRef.current?.updateFinish(result);
  }

  /** Returns the latest component state. Test seam. */
  public get state(): State {
    const s = this.handleRef.current?.getState();
    if (!s) throw new Error('FloatingIsland not yet mounted');
    return s;
  }

  /** Patch the component's settings. Test seam. */
  public setSettings(partial: Partial<Settings>): void {
    this.handleRef.current?.setSettings(partial);
  }

  public toggleTextareaExpand(): void {
    this.handleRef.current?.toggleTextareaExpand();
  }

  public toggleSettingsExpand(): void {
    this.handleRef.current?.toggleSettingsExpand();
  }

  public warnBrowserFreeze(): void {
    this.handleRef.current?.warnBrowserFreeze();
  }

  public async destroy(keepOffscreen = false): Promise<void> {
    console.debug('[Island.mount] destroy');
    this.root.unmount();
    this.host.remove();

    if (!keepOffscreen) {
      chrome.runtime.sendMessage<RuntimeMessage>({
        action: RuntimeMessageAction.STOP_OFFSCREEN,
      });
    }
  }
}
