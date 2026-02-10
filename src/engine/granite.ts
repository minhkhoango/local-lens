import {
  AutoProcessor,
  AutoModelForVision2Seq,
  PreTrainedModel,
  load_image,
  Processor,
  env,
  TextStreamer,
  type Message,
} from '@huggingface/transformers';
import type { PerformOcrPayload, TabsConnect } from '../types';
import { doclingToHtml } from './parser';

if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL(
    'transformer_engine/',
  );
}

let processor: Processor | null = null;
let model: PreTrainedModel | null = null;
let loadingPromise: Promise<void> | null = null;

export async function loadGranite() {
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
        },
      );
      console.debug('Finish loading Granite model');
    }
    if (!processor) {
      console.debug('Loading Granite processor');
      processor = await AutoProcessor.from_pretrained(
        'onnx-community/granite-docling-258M-ONNX',
      );
      console.debug('Finish loading Granite processor');
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
    postMessage({
      action: 'PROGRESS',
      payload: { stage: 'loading-model', text: '' },
    });

    try {
      await loadGranite();
    } catch (err) {
      postMessage({
        action: 'PROGRESS',
        payload: {
          stage: 'error',
          text: `Failed to load Granite model: ${err}`,
        },
      });
      throw err;
    }
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
        action: 'PROGRESS',
        payload: {
          stage: 'error',
          text: 'processor tokenizer not found',
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
    console.debug('Generated text: ', content);
    content = content.replace(/<\|end_of_text\|>$/, '');
    const textHtml = doclingToHtml(content);

    postMessage({
      action: 'FINISH',
      payload: {
        stage: 'done',
        output: {
          textPlain: content,
          textHtml: textHtml,
        },
      },
    });
  } catch (err) {
    console.error('Recognition error:', err);
    postMessage({
      action: 'PROGRESS',
      payload: {
        stage: 'error',
        text: 'Granite recognition failed',
      },
    });
  }
}
