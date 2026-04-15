const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const pdfParse = require("pdf-parse");

const WORDS_PER_CHUNK = 500;

/**
 * Split plain text into chunks of at most `wordsPerChunk` whitespace-separated words.
 * @param {string} text
 * @param {number} wordsPerChunk
 * @returns {string[]}
 */
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
 * ExtractAndChunk — Step Functions input from Java:
 *   s3Key, referenceId, originalFilename, contentType?, size?, bucket?
 *
 * Returns { referenceId, fileName, chunks }
 */
async function handler(event) {
  const referenceId = event?.referenceId;
  const originalFilename = event?.originalFilename;
  const s3Key = event?.s3Key;
  const bucket = event?.bucket || process.env.S3_BUCKET;

  if (!referenceId || !originalFilename || !s3Key) {
    throw new Error(
      "Missing required fields: referenceId, originalFilename, s3Key"
    );
  }
  if (!bucket) {
    throw new Error("Missing bucket (event.bucket or env S3_BUCKET)");
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const s3 = new S3Client({ region });

  const get = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    })
  );

  if (!get.Body) {
    throw new Error("S3 GetObject returned empty Body");
  }

  const buffer = Buffer.from(await get.Body.transformToByteArray());

  let text = "";
  try {
    const parsed = await pdfParse(buffer);
    text = parsed.text || "";
  } catch (e) {
    throw new Error(`pdf-parse failed: ${e.message}`);
  }

  const textChunks = chunkTextByWords(text, WORDS_PER_CHUNK);

  return {
    referenceId,
    fileName: originalFilename,
    chunks: textChunks,
  };
}

module.exports = { handler };
