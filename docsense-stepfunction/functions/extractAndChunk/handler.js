const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const pdfParse = require("pdf-parse");
const {
  BATCH_SIZE,
  resolveBatchesPrefix,
  batchFileKey,
} = require("../utils/s3Ingestion");

const WORDS_PER_CHUNK = 200;
/** Words repeated from the end of the previous chunk so context is not cut at boundaries. */
const OVERLAP_WORDS = 40;

/**
 * Sliding windows of `wordsPerChunk` words, advancing by `wordsPerChunk - overlapWords`
 * so each boundary carries `overlapWords` from the prior chunk and the rest is new text.
 */
function chunkTextByWordsWithOverlap(text, wordsPerChunk, overlapWords) {
  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const stride = wordsPerChunk - overlapWords;
  if (stride <= 0) {
    throw new Error("overlap must be less than wordsPerChunk");
  }
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) {
      break;
    }
    start += stride;
  }
  return chunks;
}

/**
 * Input (snake_case): reference_id, bucket, s3_key, file_name (or original_filename),
 * optional folder_name (workspace key prefix, e.g. tenants/{tid}/{reference_id}/ — batches/ appended),
 *   ignored for path if it is only a short id with no slashes; then s3_folder_prefix or derivation applies,
 * optional s3_folder_prefix (same role as a full-path folder_name when folder_name is not a key prefix).
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
  const chunks = chunkTextByWordsWithOverlap(
    text,
    WORDS_PER_CHUNK,
    OVERLAP_WORDS
  );
  const reference_id = event.reference_id;
  const file_name = event.file_name ?? event.original_filename;
  const bucket = event.bucket;

  const bp = resolveBatchesPrefix(event);
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
