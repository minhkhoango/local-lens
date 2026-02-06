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
import type { OcrResponse, PerformOcrPayload } from '../types';

if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL(
    'transformer_engine/',
  );
}

let processor: Processor | null = null;
let model: PreTrainedModel | null = null;

export async function loadGranite() {
  if (!processor) {
    console.log('Loading Granite processor');
    processor = await AutoProcessor.from_pretrained(
      'onnx-community/granite-docling-258M-ONNX',
    );
  }
  if (!model) {
    console.log('Loading Granite model');
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
  }
}

export async function recognizeGranite(
  payload: PerformOcrPayload,
): Promise<OcrResponse> {
  try {
    await loadGranite();
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

    if (!processor.tokenizer)
      return {
        status: 'error',
        text: 'processor tokenizer not found',
      };

    let content = '';
    await model.generate({
      ...inputs,
      max_new_tokens: 4096,
      streamer: new TextStreamer(processor.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function(streamedText) {
          console.debug('Streamed text:', streamedText);
          content += streamedText;
        },
      }),
    });
    console.debug('Generated text: ', content);

    return {
      status: 'ok',
      text: content,
    };
  } catch (err) {
    console.error('Recognition error:', err);
    return {
      status: 'error',
      text: '',
    };
  }
}
