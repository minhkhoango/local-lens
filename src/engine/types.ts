import type { PerformOcrPayload, TabsConnect } from '../types';

/**
 * Shared shape for all OCR engines (Tesseract, Granite, future ONNX engines).
 * `load`'s argument is engine-specific: Tesseract takes a language code,
 * Granite takes the postMessage callback (for download progress).
 */
export interface OcrEngine {
  load(arg: any): Promise<void>;
  recognize(
    payload: PerformOcrPayload,
    post: (message: TabsConnect) => void,
  ): Promise<void>;
  stop(): Promise<void> | void;
}
