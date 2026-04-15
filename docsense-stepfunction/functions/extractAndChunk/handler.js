const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const pdfParse = require("pdf-parse");
const {
  CHUNKS_BATCH_SIZE,
  manifestKey,
  chunkBatchesPrefix,
  chunkBatchFileKey,
  embeddingsPartsPrefix,
} = require("../utils/s3Ingestion");

const WORDS_PER_CHUNK = 500;

function chunkTextByWords(text, wordsPerChunk) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
}

/**
 * Input (snake_case): reference_id, original_filename, s3_key, bucket
 * Writes chunk batches + manifest to S3; returns tiny metadata for Step Functions.
 */
async function handler(event) {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const s3 = new S3Client({ region });

  const get = await s3.send(
    new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.s3_key,
    })
  );

  const buffer = Buffer.from(await get.Body.transformToByteArray());
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const chunks = chunkTextByWords(text, WORDS_PER_CHUNK);
  const reference_id = event.reference_id;
  const file_name = event.original_filename;
  const bucket = event.bucket;

  const cbPrefix = chunkBatchesPrefix(event.s3_key, reference_id);
  const epPrefix = embeddingsPartsPrefix(event.s3_key, reference_id);
  const mKey = manifestKey(reference_id);

  const chunk_count = chunks.length;
  const batchCount =
    chunk_count === 0 ? 0 : Math.ceil(chunk_count / CHUNKS_BATCH_SIZE);

  const uploads = [];
  for (let b = 0; b < batchCount; b++) {
    const slice = chunks.slice(
      b * CHUNKS_BATCH_SIZE,
      (b + 1) * CHUNKS_BATCH_SIZE
    );
    uploads.push(
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: chunkBatchFileKey(cbPrefix, b),
          Body: JSON.stringify({ chunks: slice }),
          ContentType: "application/json",
        })
      )
    );
  }

  uploads.push(
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: mKey,
        Body: JSON.stringify({
          chunk_batches_prefix: cbPrefix,
          chunks_batch_size: CHUNKS_BATCH_SIZE,
          embeddings_parts_prefix: epPrefix,
        }),
        ContentType: "application/json",
      })
    )
  );

  await Promise.all(uploads);

  // Each item ~110 bytes (chunk_index + reference_id UUID + bucket name).
  // Supports ~2300 chunks before approaching 256 KB.
  const chunk_indices = Array.from({ length: chunk_count }, (_, i) => ({
    chunk_index: i,
    reference_id,
    bucket,
  }));

  return {
    reference_id,
    file_name,
    bucket,
    embeddings_parts_prefix: epPrefix,
    chunk_count,
    chunk_indices,
  };
}

module.exports = { handler };
