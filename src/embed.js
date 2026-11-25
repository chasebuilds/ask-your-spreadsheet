import { pipeline, env } from '@huggingface/transformers';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor;

export async function loadModel(onProgress) {
  env.allowLocalModels = false;
  extractor ??= await pipeline('feature-extraction', MODEL, { dtype: 'q8', progress_callback: onProgress });
  return extractor;
}

/** Embed texts in batches; returns an array of Float32Array (normalized). */
export async function embed(texts, { batch = 32, onBatch } = {}) {
  const ex = await loadModel();
  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const t = await ex(texts.slice(i, i + batch), { pooling: 'mean', normalize: true });
    const [n, dim] = t.dims;
    for (let j = 0; j < n; j++) out.push(t.data.slice(j * dim, (j + 1) * dim));
    onBatch?.(Math.min(i + batch, texts.length), texts.length);
  }
  return out;
}
