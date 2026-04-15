const axios = require("axios");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");

const REQUEST_MS = 115000;

/**
 * Input: { referenceId, fileName, embeddingsResult }
 * embeddingsResult: array of embed Lambda outputs (typically { chunkText, embedding })
 */
function buildChunksWithEmbeddings(embeddingsResult) {
  const list = Array.isArray(embeddingsResult) ? embeddingsResult : [];
  return list.map((item, i) => {
    const text = item?.chunkText ?? item?.text;
    const embedding = item?.embedding;
    if (embedding == null) {
      throw new Error(
        `bulkInsert: missing embedding at index ${i} (item keys: ${Object.keys(
          item || {}
        ).join(",")})`
      );
    }
    return {
      text: text != null ? String(text) : "",
      embedding,
    };
  });
}

async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const referenceId = event?.referenceId;
  const fileName = event?.fileName;
  const embeddingsResult = event?.embeddingsResult;

  if (!referenceId || !fileName) {
    throw new Error("bulkInsert: missing referenceId or fileName");
  }

  const chunksWithEmbeddings = buildChunksWithEmbeddings(embeddingsResult);

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/internal/bulk-insert");

  const body = {
    referenceId,
    fileName,
    chunksWithEmbeddings,
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
