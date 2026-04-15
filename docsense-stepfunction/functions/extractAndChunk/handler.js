const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const pdfParse = require("pdf-parse");

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
 * Returns { reference_id, file_name, chunk_items } for Map → embedChunk
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
  const chunk_items = chunks.map((chunk_text) => ({
    chunk_text,
    reference_id,
    file_name,
  }));

  return {
    reference_id,
    file_name,
    chunk_items,
  };
}

module.exports = { handler };
