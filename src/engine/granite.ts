import {
  AutoProcessor,
  AutoModelForVision2Seq,
  PreTrainedModel,
  load_image,
  Processor,
  env,
  TextStreamer,
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
let processor: Processor | null = null;
let model: PreTrainedModel | null = null;
let loadingPromise: Promise<void> | null = null;
let progress: Record<string, ProgressStatusInfo> = {};

function postLoadingProgress(
  data: ProgressInfo,
  postMessage: (message: TabsConnect) => void,
): void {
  if (
    data.status !== 'progress' ||
    !data.file ||
    !data.file.endsWith('.onnx_data')
  )
    return;

  progress[data.file] = data;
  const values = Object.values(progress);
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

export async function loadGranite(postMessage: (message: TabsConnect) => void) {
  if (model && processor) {
    console.debug('Granite model and processor already loaded');
    return;
  }
  if (loadingPromise) {
    console.debug('Granite is currently loading, awaiting existing promise');
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    if (!processor) {
      console.debug('Loading Granite processor');
      processor = await AutoProcessor.from_pretrained(
        'onnx-community/granite-docling-258M-ONNX',
      );
      console.debug('Finish loading Granite processor');
    }
    if (!model) {
      console.debug('Loading Granite model');
      model = await AutoModelForVision2Seq.from_pretrained(
        'onnx-community/granite-docling-258M-ONNX',
        {
          dtype: {
            embed_tokens: 'fp16',
            vision_encoder: 'fp32',
            decoder_model_merged: 'fp32',
          },
          device: 'webgpu',
          progress_callback: (data) => postLoadingProgress(data, postMessage),
        },
      );
      console.debug('Finish loading Granite model');
    }
  })();

  await loadingPromise;
  loadingPromise = null;
}

export async function recognizeGranite(
  payload: PerformOcrPayload,
  postMessage: (message: TabsConnect) => void,
): Promise<void> {
  try {
    await loadGranite(postMessage);
  } catch (err) {
    postMessage({
      action: 'ERROR',
      payload: {
        stage: 'error',
        error: `Failed to load Granite model: ${err}`,
      },
    });
    throw err;
  }
  try {
    if (!processor || !model) {
      throw new Error('Failed to load Granite model or processor');
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

    const text = processor.apply_chat_template(messages, {
      add_generation_prompt: true,
    });
    const inputs = await processor(text, [image], { do_image_splitting: true });
    console.log('Model inputs:', inputs);

    if (!processor.tokenizer) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'processor tokenizer not found',
        },
      });
      throw new Error('processor tokenizer not found');
    }

    postMessage({
      action: 'PROGRESS',
      payload: {
        stage: 'recognizing',
        text: '',
      },
    });

    let content = '';
    await model.generate({
      ...inputs,
      max_new_tokens: 4096,
      streamer: new TextStreamer(processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function(streamedText) {
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
    console.debug('Generated text:\n', content);
    content = content.replace(/<\|end_of_text\|>$/, '');
    const textHtml = doclingToHtml(content);
    console.log('Converted HTML:\n', textHtml);

    const textPlain = htmlToText(textHtml);
    console.log('Converted plain text:\n', textPlain);

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
        error: 'Granite recognition failed',
      },
    });
  }
}
