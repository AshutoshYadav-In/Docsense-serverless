const axios = require("axios");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");

const REQUEST_MS = 55000;

/**
 * Map iterator — event: chunk_text, reference_id, file_name (snake_case).
 * Backend JSON uses snake_case (Jackson).
 */
async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const chunk_text = event?.chunk_text;
  const text = chunk_text == null ? "" : String(chunk_text).trim();
  if (!text) {
    throw new Error("embedChunk: missing chunk_text");
  }

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/api/internal/embed");

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
    return { ...data, chunk_text: text };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw formatAxiosError(err);
    }
    throw err;
  }
}

module.exports = { handler };
