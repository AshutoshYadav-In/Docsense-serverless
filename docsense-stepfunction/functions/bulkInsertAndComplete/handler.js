const axios = require("axios");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");
const { batchFileKey } = require("../utils/s3Ingestion");

const REQUEST_MS = 115000;

async function loadAllBatches(s3, bucket, batches_prefix, batch_count) {
  if (batch_count === 0) return [];
  const keys = Array.from({ length: batch_count }, (_, i) =>
    batchFileKey(batches_prefix, i)
  );
  const rawBodies = await Promise.all(
    keys.map((Key) =>
      s3
        .send(new GetObjectCommand({ Bucket: bucket, Key }))
        .then((o) => o.Body.transformToString())
    )
  );
  const all = [];
  rawBodies.forEach((raw, batchIdx) => {
    const entries = JSON.parse(raw);
    entries.forEach((entry, localIdx) => {
      if (entry.embedding == null) {
        throw new Error(
          `bulkInsert: missing embedding in batch ${batchIdx} index ${localIdx}`
        );
      }
      const text = entry.text;
      if (text == null || String(text).trim() === "") {
        throw new Error(
          `bulkInsert: missing text in batch ${batchIdx} index ${localIdx}`
        );
      }
      all.push({ text: String(text).trim(), embedding: entry.embedding });
    });
  });
  return all;
}

async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const reference_id = event?.reference_id;
  const file_name = event?.file_name;
  const bucket = event?.bucket;
  const batches_prefix = event?.batches_prefix;
  const chunk_count = Number(event?.chunk_count);
  const batch_count = Number(event?.batch_count);

  if (!reference_id || !file_name) {
    throw new Error("bulkInsert: missing reference_id or file_name");
  }
  if (!bucket || !batches_prefix) {
    throw new Error("bulkInsert: missing bucket or batches_prefix");
  }
  if (!Number.isFinite(batch_count) || batch_count < 0) {
    throw new Error("bulkInsert: missing or invalid batch_count");
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const s3 = new S3Client({ region });

  const chunks_with_embeddings = await loadAllBatches(
    s3,
    bucket,
    batches_prefix,
    batch_count
  );

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/api/internal/bulk-insert");

  const body = {
    reference_id,
    file_name,
    chunks_with_embeddings,
    number_of_chunks: chunk_count,
  };

  try {
    const { data } = await axios.post(url, body, {
      timeout: REQUEST_MS,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
        "X-Client-Token": clientToken,
      },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw formatAxiosError(err);
    }
    throw err;
  }
}

module.exports = { handler };
