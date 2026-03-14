import {
  AutoProcessor,
  AutoModelForVision2Seq,
  PreTrainedModel,
  load_image,
  Processor,
  env,
  TextStreamer,
  InterruptableStoppingCriteria,
  type Message,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { PerformOcrPayload, TabsConnect } from '../types';
import { doclingToHtml } from './parser/html';
import { htmlToText } from './parser/text';

if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL(
    'transformer_engine/',
  );
}

type ProgressStatusInfo = {
  status: 'progress';
  name: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
};

export class GraniteEngine {
  private processor: Processor | null = null;
  private model: PreTrainedModel | null = null;
  private stopCriteria: InterruptableStoppingCriteria =
    new InterruptableStoppingCriteria();
  private loadingPromise: Promise<void> | null = null;
  private progress: Record<string, ProgressStatusInfo> = {};

  public async load(
    postMessage: (message: TabsConnect) => void,
  ): Promise<void> {
    if (this.model && this.processor) {
      console.debug('Granite model and processor already loaded');
      return;
    }
    if (this.loadingPromise) {
      console.debug('Granite is currently loading, awaiting existing promise');
      await this.loadingPromise;
      return;
    }

    try {
      this.loadingPromise = (async () => {
        if (!this.processor) {
          this.processor = await AutoProcessor.from_pretrained(
            'onnx-community/granite-docling-258M-ONNX',
          );
          console.debug('Finish loading Granite processor');
        }
        if (!this.model) {
          this.model = await AutoModelForVision2Seq.from_pretrained(
            'onnx-community/granite-docling-258M-ONNX',
            {
              dtype: {
                embed_tokens: 'fp16',
                vision_encoder: 'fp32',
                decoder_model_merged: 'fp32',
              },
              device: 'webgpu',
              progress_callback: (data) =>
                this.postLoadingProgress(data, postMessage),
            },
          );
          console.debug('Finish loading Granite model');
        }
      })();

      await this.loadingPromise;
      this.loadingPromise = null;
    } catch (err) {
      console.error('Failed to load Granite engine:', err);
    }
  }

  private postLoadingProgress(
    data: ProgressInfo,
    postMessage: (message: TabsConnect) => void,
  ): void {
    if (
      data.status !== 'progress' ||
      !data.file ||
      !data.file.endsWith('.onnx_data')
    )
      return;

    this.progress[data.file] = data;
    const values = Object.values(this.progress);
    if (values.length !== 3) return;

    const { loadedSum, totalSum } = values.reduce(
      (acc, val) => ({
        loadedSum: acc.loadedSum + val.loaded,
        totalSum: acc.totalSum + val.total,
      }),
      { loadedSum: 0, totalSum: 0 },
    );

    const overallProgress = Math.round((loadedSum / totalSum) * 100);
    postMessage({
      action: 'DOWNLOAD',
      payload: {
        stage: 'downloading',
        progress: overallProgress,
      },
    });
  }

  public async recognize(
    payload: PerformOcrPayload,
    postMessage: (message: TabsConnect) => void,
  ): Promise<void> {
    await this.load(postMessage);

    if (!this.processor || !this.model || !this.processor.tokenizer) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: chrome.i18n.getMessage('engine_thinking_err_init'),
        },
      });
      return;
    }

    const image = await load_image(payload.croppedImage);
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image' },
          { type: 'text', text: 'Convert this page to docling.' },
          // https://huggingface.co/ibm-granite/granite-docling-258M
        ],
      },
    ] as unknown as Message[];
    const text = this.processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });
    const inputs = await this.processor(text, [image], {
      do_image_splitting: true,
    });

    // Reset stop criteria for each new recognition task
    this.stopCriteria.reset();

    postMessage({
      action: 'PROGRESS',
      payload: {
        stage: 'recognizing',
        text: '',
      },
    });

    try {
      let content = '';
      await this.model.generate({
        ...inputs,
        max_new_tokens: 4096,
        stopping_criteria: this.stopCriteria,
        streamer: new TextStreamer(this.processor.tokenizer, {
          skip_prompt: true,
          skip_special_tokens: false,
          callback_function: (streamedText) => {
            content += streamedText;
            postMessage({
              action: 'PROGRESS',
              payload: {
                stage: 'recognizing',
                text: content,
              },
            });
          },
        }),
      });

      content = content.replace(/<\|end_of_text\|>$/, '');
      const textHtml = doclingToHtml(content);
      const textPlain = htmlToText(textHtml);

      console.debug('textHtml:\n', textHtml);
      console.debug('textPlain:\n', textPlain);

      postMessage({
        action: 'FINISH',
        payload: {
          stage: 'done',
          output: {
            textPlain: textPlain,
            textHtml: textHtml,
          },
        },
      });
    } catch (err) {
      console.error('Recognition error:', err);
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: chrome.i18n.getMessage('engine_thinking_err_recognize'),
        },
      });
    }
  }

  public stop(): void {
    console.debug('[Granite] Stopping Granite recognition');
    this.stopCriteria.interrupt();
  }
}
