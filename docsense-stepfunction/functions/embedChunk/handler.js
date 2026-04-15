const axios = require("axios");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");
const {
  CHUNKS_BATCH_SIZE,
  manifestKey,
  chunkBatchFileKey,
  embeddingPartKey,
} = require("../utils/s3Ingestion");

const REQUEST_MS = 55000;

let cachedManifest = null;
let cachedManifestRef = null;

async function loadManifest(s3, bucket, reference_id) {
  if (cachedManifest && cachedManifestRef === reference_id) {
    return cachedManifest;
  }
  const key = manifestKey(reference_id);
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const raw = await res.Body.transformToString();
  cachedManifest = JSON.parse(raw);
  cachedManifestRef = reference_id;
  return cachedManifest;
}

/**
 * Map iterator — event: { chunk_index, reference_id, bucket }.
 * Reads manifest from S3 (cached across warm invocations), loads batch file,
 * embeds via Java, writes embedding part. Returns { chunk_index } only.
 */
async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const chunk_index = event?.chunk_index;
  const bucket = event?.bucket;
  const reference_id = event?.reference_id;

  if (chunk_index == null || !bucket || !reference_id) {
    throw new Error("embedChunk: missing chunk_index, bucket, or reference_id");
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const s3 = new S3Client({ region });

  const manifest = await loadManifest(s3, bucket, reference_id);
  const chunk_batches_prefix = manifest.chunk_batches_prefix;
  const chunks_batch_size = manifest.chunks_batch_size ?? CHUNKS_BATCH_SIZE;
  const embeddings_parts_prefix = manifest.embeddings_parts_prefix;

  if (!chunk_batches_prefix || !embeddings_parts_prefix) {
    throw new Error("embedChunk: manifest missing required prefixes");
  }

  const idx = Number(chunk_index);
  const batchIndex = Math.floor(idx / chunks_batch_size);
  const localIndex = idx % chunks_batch_size;
  const batchKey = chunkBatchFileKey(chunk_batches_prefix, batchIndex);

  const chunksGet = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: batchKey })
  );
  const chunksJson = await chunksGet.Body.transformToString();
  const parsed = JSON.parse(chunksJson);
  const batchChunks = parsed.chunks;
  const text =
    batchChunks == null || batchChunks[localIndex] == null
      ? ""
      : String(batchChunks[localIndex]).trim();
  if (!text) {
    throw new Error(
      `embedChunk: no chunk text at global index ${chunk_index} (batch ${batchIndex}, local ${localIndex})`
    );
  }

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/api/internal/embed");

  let data;
  try {
    const res = await axios.post(
      url,
      { chunk_text: text },
      {
        timeout: REQUEST_MS,
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": clientId,
          "X-Client-Token": clientToken,
        },
        validateStatus: (s) => s >= 200 && s < 300,
      }
    );
    data = res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw formatAxiosError(err);
    }
    throw err;
  }

  const embedding = data?.embedding ?? data?.embedding_vector ?? data?.vector;
  if (embedding == null) {
    throw new Error("embedChunk: embed response missing embedding");
  }

  const partKey = embeddingPartKey(embeddings_parts_prefix, chunk_index);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: partKey,
      Body: JSON.stringify({ chunk_text: text, embedding }),
      ContentType: "application/json",
    })
  );

  return { chunk_index };
}

module.exports = { handler };
