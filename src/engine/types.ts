import type { PerformOcrPayload, TabsConnect } from '../types';

/** Shared shape for bundled PaddleOCR engines (fast, structured). */
export interface OcrEngine {
  load(arg?: unknown, post?: (message: TabsConnect) => void): Promise<void>;
  recognize(
    payload: PerformOcrPayload,
    post: (message: TabsConnect) => void,
  ): Promise<void>;
  stop(): Promise<void> | void;
}
