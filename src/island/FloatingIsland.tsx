import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  ClipboardOutput,
  DownloadProgress,
  EngineOption,
  ErrorPayload,
  Point,
  ProgressPayload,
  ResultPayload,
  Settings,
  ToggleSettings,
} from '../types';
import { CLASS, CONFIG, ICONS, INITIAL_STATE } from './constants';
import { reducer } from './reducer';
import type { State } from './types';
import { Storage } from './storage';
import { DragController, EventsController } from './behavior';
import { calculateDynamicWidth, clampToViewport } from './utils';

const ENGINE_OPTIONS: Record<EngineOption, string> = {
  fast: 'Fast',
  structured: 'Structured',
};

const TOGGLE_KEYS: Array<{ key: keyof ToggleSettings; label: string }> = [
  { key: 'autoCopy', label: 'Auto-Copy' },
  { key: 'autoExpand', label: 'Auto-Expand' },
];

export interface IslandHandle {
  updateDownload(p: DownloadProgress): void;
  updateProgress(p: ProgressPayload): void;
  updateError(p: ErrorPayload): void;
  updateFinish(p: ResultPayload): void;
  // Test/debug seams
  getState(): State;
  setSettings(partial: Partial<Settings>): void;
  toggleTextareaExpand(): void;
  toggleSettingsExpand(): void;
  warnBrowserFreeze(): void;
}

export interface FloatingIslandProps {
  cursorPosition: Point;
  imageUrl: string;
  isPdf: boolean;
  webgpuSupported: boolean;
  onDestroy: () => void;
  /**
   * Re-run OCR on the current crop with a different engine. Resolves when the
   * request has been handed to the offscreen document, not when OCR finishes —
   * results stream back through the update* handle methods.
   */
  onEngineChange: (engine: EngineOption) => Promise<void>;
}

export const FloatingIsland = forwardRef<IslandHandle, FloatingIslandProps>(
  function FloatingIsland(props, ref) {
    const [state, dispatch] = useReducer(reducer, {
      ...INITIAL_STATE,
      imageUrl: props.imageUrl,
      isPdf: props.isPdf,
      webgpuSupported: props.webgpuSupported,
    });

    const storageRef = useRef<Storage>(new Storage());
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragController | null>(null);
    const eventsRef = useRef<EventsController | null>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    const [position, setPosition] = useState<Point>(() =>
      clampToViewport(
        props.cursorPosition,
        CONFIG.widthCollapsed,
        CONFIG.heightCollapsed,
      ),
    );
    const positionRef = useRef(position);
    positionRef.current = position;

    const [downloadProgress, setDownloadProgress] = useState<number | undefined>(
      undefined,
    );
    const [warningVisible, setWarningVisible] = useState(false);
    const warningTimerRef = useRef<number | null>(null);

    const width = useMemo(() => {
      if (!state.isTextExpanded) return CONFIG.widthCollapsed;
      return calculateDynamicWidth(state.settings.engine, state.textarea);
    }, [state.isTextExpanded, state.settings.engine, state.textarea]);

    // Shift position left when width grows so the right edge stays put; clamp to viewport.
    const prevWidthRef = useRef(width);
    useEffect(() => {
      const oldWidth = prevWidthRef.current;
      if (oldWidth === width) return;
      prevWidthRef.current = width;
      const delta = width - oldWidth;
      setPosition((p) => {
        const h = containerRef.current?.clientHeight || CONFIG.heightCollapsed;
        return clampToViewport({ x: p.x - delta, y: p.y }, width, h);
      });
    }, [width]);

    // Load persisted settings + shortcut + firstEngineSwitch once on mount.
    useEffect(() => {
      let cancelled = false;
      void (async () => {
        const storage = storageRef.current;
        const [settings, shortcutText, firstSwitch] = await Promise.all([
          storage.loadSettings(),
          storage.getShortcut(),
          storage.isFirstEngineSwitch(),
        ]);
        if (cancelled) return;
        dispatch({ type: 'settingsLoaded', settings, shortcutText });
        dispatch({ type: 'firstEngineSwitchLoaded', value: firstSwitch });
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    // Drag + global event controllers. Bound to the shadow host so click-outside works.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const root = container.getRootNode();
      const host =
        root instanceof ShadowRoot
          ? (root.host as HTMLDivElement)
          : (container as HTMLDivElement);

      const drag = new DragController((newPos) => {
        const h = container.clientHeight || CONFIG.heightCollapsed;
        setPosition(clampToViewport(newPos, prevWidthRef.current, h));
      });
      dragRef.current = drag;

      const events = new EventsController(host, props.isPdf, {
        onDestroy: () => props.onDestroy(),
        onReposition: (pos) => {
          const h = container.clientHeight || CONFIG.heightCollapsed;
          setPosition(clampToViewport(pos, prevWidthRef.current, h));
        },
        getCurrentPosition: () => positionRef.current,
      });
      eventsRef.current = events;
      events.attach();

      return () => {
        drag.destroy();
        events.destroy();
        dragRef.current = null;
        eventsRef.current = null;
      };
      // props.isPdf and props.onDestroy are stable for the island's lifetime.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      return () => {
        if (warningTimerRef.current !== null) {
          window.clearTimeout(warningTimerRef.current);
        }
      };
    }, []);

    const copyToClipboard = useCallback(
      async (output: ClipboardOutput): Promise<void> => {
        if (!output.textHtml || !output.textPlain) return;

        const doubleDollar = output.textHtml
          .replace(
            /<div class="formula">([\s\S]*?)<\/div>/g,
            '<div class="formula">$$$$$1$$$$</div>',
          )
          .replace(
            /<span class="formula">([\s\S]*?)<\/span>/g,
            '<span class="formula">$$$$$1$$$$</span>',
          );
        const finalHtml =
          '<style>table,th,td{border:1px solid black;border-collapse:collapse;padding:4px}</style>' +
          doubleDollar;

        const item = new ClipboardItem({
          'text/plain': new Blob([output.textPlain], { type: 'text/plain' }),
          'text/html': new Blob([finalHtml], { type: 'text/html' }),
        });

        try {
          await navigator.clipboard.write([item]);
          dispatch({ type: 'copySuccess' });
        } catch (err) {
          if (err instanceof Error && err.message.includes('focus')) {
            console.debug('Auto-copy blocked, wait for user to click');
            return;
          }
          console.error('Clipboard write failed:', err);
        }
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        updateDownload(payload) {
          dispatch({ type: 'downloadStatus', status: payload.stage });
          setDownloadProgress(payload.progress);
        },
        updateProgress(payload) {
          setDownloadProgress(undefined);
          dispatch({
            type: 'ocrProgress',
            status: payload.stage,
            text: payload.text,
          });
        },
        updateError(payload) {
          setDownloadProgress(undefined);
          dispatch({ type: 'ocrError', message: payload.error });
        },
        updateFinish(payload) {
          setDownloadProgress(undefined);
          const textarea = payload.output.textHtml || payload.output.textPlain;
          const current = stateRef.current;
          dispatch({
            type: 'ocrFinish',
            output: payload.output,
            textarea,
          });
          if (current.settings.autoCopy) void copyToClipboard(payload.output);
          if (current.settings.engine !== 'fast') {
            dispatch({ type: 'firstEngineSwitchCompleted' });
            void storageRef.current.firstEngineSwitchCompleted();
          }
        },
        getState() {
          return stateRef.current;
        },
        setSettings(partial) {
          const next: Settings = { ...stateRef.current.settings, ...partial };
          // Sync the ref immediately so a follow-up imperative call (e.g.
          // updateFinish reading autoCopy) sees the new value before React
          // commits the dispatched update.
          stateRef.current = { ...stateRef.current, settings: next };
          dispatch({
            type: 'settingsLoaded',
            settings: next,
            shortcutText: stateRef.current.shortcutText,
          });
        },
        toggleTextareaExpand() {
          dispatch({ type: 'expandText' });
        },
        toggleSettingsExpand() {
          dispatch({ type: 'expandSettings' });
        },
        warnBrowserFreeze() {
          if (warningTimerRef.current !== null) {
            window.clearTimeout(warningTimerRef.current);
          }
          setWarningVisible(true);
          warningTimerRef.current = window.setTimeout(() => {
            setWarningVisible(false);
            warningTimerRef.current = null;
          }, 5000);
        },
      }),
      [copyToClipboard],
    );

    // ---- Handlers -----------------------------------------------------------

    const handleCopyClick = useCallback((): void => {
      void copyToClipboard(state.clipboardOutput);
    }, [copyToClipboard, state.clipboardOutput]);

    const handleSettingsClick = useCallback((): void => {
      dispatch({ type: 'expandSettings' });
    }, []);

    const handlePreviewClick = useCallback((): void => {
      dispatch({ type: 'expandText' });
    }, []);

    const handleShortcutClick = useCallback((): void => {
      storageRef.current.openShortcutsPage();
    }, []);

    const handleToggleSetting = useCallback(
      (key: keyof ToggleSettings): void => {
        const newValue = !state.settings[key];
        const newSettings: Settings = { ...state.settings, [key]: newValue };
        dispatch({ type: 'toggleSetting', key });
        void storageRef.current.saveSettings(newSettings);

        if (key === 'autoExpand') {
          dispatch({ type: 'setTextExpanded', value: newValue });
          return;
        }
        // autoCopy
        if (!state.hasCopied && newValue) {
          void copyToClipboard(state.clipboardOutput);
        }
      },
      [
        copyToClipboard,
        state.clipboardOutput,
        state.hasCopied,
        state.settings,
      ],
    );

    const handleEngineChange = useCallback(
      async (engine: EngineOption): Promise<void> => {
        const newSettings: Settings = { ...state.settings, engine };
        dispatch({ type: 'setEngine', engine });
        void storageRef.current.saveSettings(newSettings);
        dispatch({ type: 'ocrStartLoading' });

        try {
          await props.onEngineChange(engine);
        } catch (err) {
          console.error('Engine update failed:', err);
          dispatch({
            type: 'ocrError',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
      [props, state.settings],
    );

    const handleMouseDown = useCallback((e: React.MouseEvent): void => {
      dragRef.current?.start(e.nativeEvent, positionRef.current);
    }, []);

    // ---- Derived UI strings -------------------------------------------------

    const statusText = useMemo(() => {
      const { status, hasCopied } = state;

      if (status === 'downloading') {
        if (downloadProgress === undefined) return 'Loading model...';
        return `Loading model: ${downloadProgress}%`;
      }
      if (status === 'loading-model') return 'Loading model...';
      if (status === 'recognizing') return 'Recognizing...';
      if (status === 'error') return 'Error';
      if (hasCopied) return 'Copied!';
      return 'Extracted';
    }, [state, downloadProgress]);

    const previewText = useMemo(() => {
      const max = state.isTextExpanded ? 100 : 25;
      const text = state.textarea;
      return text.length > max ? text.slice(0, max) + '...' : text;
    }, [state.textarea, state.isTextExpanded]);

    const previewTitle = state.isTextExpanded ? 'Collapse' : 'Expand';

    const isLoadingForCopy =
      state.status === 'loading-model' || state.status === 'recognizing';

    const copyBtnClass = isLoadingForCopy
      ? `${CLASS.BTN.btn} ${CLASS.BTN.copy} ${CLASS.STATE.copyLoading}`
      : `${CLASS.BTN.btn} ${CLASS.BTN.copy} ${state.hasCopied ? CLASS.STATE.copySuccess : ''}`;

    const copyBtnIcon = isLoadingForCopy
      ? ICONS.spinner
      : state.hasCopied
        ? ICONS.check
        : ICONS.clipboard;

    const islandClass = [
      'island',
      state.isTextExpanded ? CLASS.STATE.textExpanded : '',
      state.isSettingsExpanded ? CLASS.STATE.settingsExpanded : '',
    ]
      .filter(Boolean)
      .join(' ');

    const textareaIsHtml = state.status === 'done';

    return (
      <div
        ref={containerRef}
        className={islandClass}
        style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${width}px` }}
        onMouseDown={handleMouseDown}
      >
        <div className="row">
          <img className="image" src={state.imageUrl} />
          <div className="content">
            <span className={`${CLASS.MAIN.status} ${state.status}`}>
              {statusText}
            </span>
            <div
              className={CLASS.MAIN.preview}
              title={previewTitle}
              onClick={handlePreviewClick}
            >
              {previewText}
            </div>
          </div>
          <div className="actions">
            <button
              className={copyBtnClass}
              title="Copy"
              disabled={isLoadingForCopy}
              onClick={handleCopyClick}
              dangerouslySetInnerHTML={{ __html: copyBtnIcon }}
            />
            <button
              className={`${CLASS.BTN.btn} ${CLASS.BTN.settings}`}
              title="Settings"
              onClick={handleSettingsClick}
              dangerouslySetInnerHTML={{ __html: ICONS.settings }}
            />
          </div>
        </div>

        <div className={CLASS.MAIN.viewContainer}>
          {textareaIsHtml ? (
            <div
              contentEditable={false}
              className={CLASS.MAIN.textarea}
              dangerouslySetInnerHTML={{ __html: state.textarea }}
            />
          ) : (
            <div contentEditable={false} className={CLASS.MAIN.textarea}>
              {state.textarea}
            </div>
          )}
          <div
            className={`${CLASS.MAIN.engineWarning} ${warningVisible ? 'show' : 'hidden'}`}
          >
            {warningVisible
              ? 'Note: Browser may freeze on weaker hardware, you may go back to "Fast" mode.'
              : ''}
          </div>
          <div className={CLASS.MAIN.toolsBar}>
            <div className="select-wrapper">
              <select
                className={CLASS.SETTINGS.select}
                data-key="engine"
                value={state.settings.engine}
                onChange={(e) =>
                  void handleEngineChange(e.target.value as EngineOption)
                }
              >
                {Object.entries(ENGINE_OPTIONS).map(([value, display]) => (
                  <option key={value} value={value}>
                    {display}
                  </option>
                ))}
              </select>
              <div
                className="select-icon"
                dangerouslySetInnerHTML={{ __html: ICONS.dropdown }}
              />
            </div>
          </div>
        </div>

        <div className="settings">
          {TOGGLE_KEYS.map(({ key, label }) => (
            <div className="settings-row" key={key}>
              <span>{label}</span>
              <div
                className={`${CLASS.SETTINGS.toggle} ${
                  state.settings[key] ? CLASS.STATE.toggleActive : ''
                }`}
                data-key={key}
                onClick={() => handleToggleSetting(key)}
              />
            </div>
          ))}
          <div className="settings-row">
            <span>Keyboard shortcut</span>
            <button
              className={CLASS.BTN.shortcut}
              onClick={handleShortcutClick}
            >
              {state.shortcutText}
            </button>
          </div>
        </div>
      </div>
    );
  },
);

