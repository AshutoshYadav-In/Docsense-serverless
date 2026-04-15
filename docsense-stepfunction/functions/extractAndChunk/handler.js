const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const pdfParse = require("pdf-parse");
const {
  BATCH_SIZE,
  batchesPrefix,
  batchFileKey,
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
 * Writes batch files (text + embedding:null) under batches/; returns tiny metadata.
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

  const bp = batchesPrefix(event.s3_key, reference_id);
  const chunk_count = chunks.length;
  const batch_count =
    chunk_count === 0 ? 0 : Math.ceil(chunk_count / BATCH_SIZE);

  const uploads = [];
  for (let b = 0; b < batch_count; b++) {
    const slice = chunks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const entries = slice.map((t) => ({ text: t, embedding: null }));
    uploads.push(
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: batchFileKey(bp, b),
          Body: JSON.stringify(entries),
          ContentType: "application/json",
        })
      )
    );
  }
  await Promise.all(uploads);

  // ~120 bytes per item — 40 batches (1000 chunks) ≈ 5 KB. Safe.
  const batch_indices = Array.from({ length: batch_count }, (_, i) => ({
    batch_index: i,
    reference_id,
    bucket,
    batches_prefix: bp,
  }));

  return {
    reference_id,
    file_name,
    bucket,
    batches_prefix: bp,
    chunk_count,
    batch_count,
    batch_indices,
  };
}

module.exports = { handler };
