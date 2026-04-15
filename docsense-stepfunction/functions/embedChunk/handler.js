const axios = require("axios");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");
const { batchFileKey } = require("../utils/s3Ingestion");

/** Must match com.project.ashutosh.dto.EmbedBatchRequest.MAX_TEXTS_PER_REQUEST */
const MAX_TEXTS_PER_REQUEST = 10;

const REQUEST_MS = 120000;

/**
 * Map iterator — processes one batch file (up to 25 chunks).
 * Calls Java bulk embed API with up to 10 texts per HTTP request (same keys in response).
 * Writes batch file back with embeddings filled in.
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

  for (let start = 0; start < entries.length; start += MAX_TEXTS_PER_REQUEST) {
    const end = Math.min(start + MAX_TEXTS_PER_REQUEST, entries.length);
    /** @type {Record<string, string>} */
    const texts = {};
    for (let i = start; i < end; i++) {
      const t = entries[i].text == null ? "" : String(entries[i].text).trim();
      if (!t) {
        throw new Error(
          `embedBatch: blank text at batch ${batch_index} index ${i}`
        );
      }
      texts[String(i)] = t;
    }

    let data;
    try {
      const res = await axios.post(
        url,
        { texts },
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

    const embeddings = data?.embeddings;
    if (embeddings == null || typeof embeddings !== "object") {
      throw new Error(
        "embedBatch: response missing embeddings map (expected EmbedBatchResponse)"
      );
    }

    for (let i = start; i < end; i++) {
      const keyStr = String(i);
      const embedding = embeddings[keyStr];
      if (embedding == null) {
        throw new Error(
          `embedBatch: missing embedding for key "${keyStr}" in batch ${batch_index}`
        );
      }
      entries[i].embedding = embedding;
    }
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
