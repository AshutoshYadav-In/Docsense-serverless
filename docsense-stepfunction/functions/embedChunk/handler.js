const axios = require("axios");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");
const { batchFileKey } = require("../utils/s3Ingestion");

const REQUEST_MS = 55000;
const EMBED_CONCURRENCY = 5;

/**
 * Map iterator — processes an entire batch (up to 25 chunks).
 * Reads batch file, embeds each entry via Java API, writes back with embeddings.
 * Returns { batch_index } only.
 */
async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const batch_index = event?.batch_index;
  const bucket = event?.bucket;
  const reference_id = event?.reference_id;
  const batches_prefix = event?.batches_prefix;

  if (batch_index == null || !bucket || !reference_id || !batches_prefix) {
    throw new Error(
      "embedBatch: missing batch_index, bucket, reference_id, or batches_prefix"
    );
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const s3 = new S3Client({ region });
  const key = batchFileKey(batches_prefix, batch_index);

  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const entries = JSON.parse(await obj.Body.transformToString());

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/api/internal/embed");

  async function embedOne(entry, localIdx) {
    const text = entry.text == null ? "" : String(entry.text).trim();
    if (!text) {
      throw new Error(
        `embedBatch: blank text at batch ${batch_index} index ${localIdx}`
      );
    }
    try {
      const { data } = await axios.post(
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
      const embedding = data?.embedding;
      if (embedding == null) {
        throw new Error(
          `embedBatch: no embedding in response for batch ${batch_index} index ${localIdx}`
        );
      }
      entry.embedding = embedding;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        throw formatAxiosError(err);
      }
      throw err;
    }
  }

  for (let i = 0; i < entries.length; i += EMBED_CONCURRENCY) {
    const slice = entries.slice(i, i + EMBED_CONCURRENCY);
    await Promise.all(
      slice.map((entry, offset) => embedOne(entry, i + offset))
    );
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(entries),
      ContentType: "application/json",
    })
  );

  return { batch_index };
}

module.exports = { handler };
