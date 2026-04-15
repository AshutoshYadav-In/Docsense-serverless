const axios = require("axios");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");

const REQUEST_MS = 115000;

/**
 * Input (snake_case from Step Functions):
 *   reference_id, file_name, embeddings_result
 *
 * Top-level keys snake_case for Jackson. Each row uses `text` in JSON; value
 * comes from embed output `chunk_text` (always present from our embed Lambda).
 */
function buildChunksWithEmbeddings(embeddings_result) {
  const list = Array.isArray(embeddings_result) ? embeddings_result : [];
  return list.map((item, i) => {
    const embedding = item?.embedding;
    if (embedding == null) {
      throw new Error(`bulkInsert: missing embedding at index ${i}`);
    }
    const chunk_text = item?.chunk_text;
    if (chunk_text == null || String(chunk_text).trim() === "") {
      throw new Error(`bulkInsert: missing chunk_text at index ${i}`);
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
  const embeddings_result = event?.embeddings_result;

  if (!reference_id || !file_name) {
    throw new Error("bulkInsert: missing reference_id or file_name");
  }

  const chunks_with_embeddings = buildChunksWithEmbeddings(embeddings_result);

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/api/internal/bulk-insert");

  const body = {
    reference_id,
    file_name,
    chunks_with_embeddings,
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
