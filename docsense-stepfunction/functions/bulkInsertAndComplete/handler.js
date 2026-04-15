const axios = require("axios");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");
const { embeddingPartKey } = require("../utils/s3Ingestion");

const REQUEST_MS = 115000;

async function loadPartsFromS3(
  s3,
  bucket,
  embeddings_parts_prefix,
  chunk_count
) {
  if (chunk_count === 0) {
    return [];
  }
  const keys = Array.from({ length: chunk_count }, (_, i) =>
    embeddingPartKey(embeddings_parts_prefix, i)
  );
  const bodies = await Promise.all(
    keys.map((Key) =>
      s3
        .send(new GetObjectCommand({ Bucket: bucket, Key }))
        .then((o) => o.Body.transformToString())
    )
  );
  return bodies.map((raw, i) => {
    const part = JSON.parse(raw);
    const chunk_text = part?.chunk_text;
    const embedding = part?.embedding;
    if (embedding == null) {
      throw new Error(`bulkInsert: missing embedding in part ${i}`);
    }
    if (chunk_text == null || String(chunk_text).trim() === "") {
      throw new Error(`bulkInsert: missing chunk_text in part ${i}`);
    }
    return {
      text: String(chunk_text).trim(),
      embedding,
    };
  });
}

async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const reference_id = event?.reference_id;
  const file_name = event?.file_name;
  const bucket = event?.bucket;
  const embeddings_parts_prefix = event?.embeddings_parts_prefix;
  const chunk_count = event?.chunk_count;

  if (!reference_id || !file_name) {
    throw new Error("bulkInsert: missing reference_id or file_name");
  }
  if (!bucket || embeddings_parts_prefix == null) {
    throw new Error("bulkInsert: missing bucket or embeddings_parts_prefix");
  }
  const n = Number(chunk_count);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("bulkInsert: missing or invalid chunk_count");
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const s3 = new S3Client({ region });

  const chunks_with_embeddings = await loadPartsFromS3(
    s3,
    bucket,
    embeddings_parts_prefix,
    n
  );

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/api/internal/bulk-insert");

  const body = {
    reference_id,
    file_name,
    chunks_with_embeddings,
    number_of_chunks: n,
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
