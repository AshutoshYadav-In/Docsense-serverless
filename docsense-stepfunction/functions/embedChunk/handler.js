const axios = require("axios");
const { getClientCredentials } = require("../utils/clientCredentials");
const { joinUrl, formatAxiosError } = require("../utils/javaApi");

const REQUEST_MS = 55000;

/**
 * Map iterator — input: { chunkText, referenceId, fileName }
 * POST /internal/embed → { chunkText, embedding }
 */
async function handler(event) {
  const baseUrl = process.env.JAVA_API_BASE_URL;
  if (!baseUrl) {
    throw new Error("JAVA_API_BASE_URL is not set on this Lambda");
  }

  const chunkText = event?.chunkText;
  if (chunkText == null || chunkText === "") {
    throw new Error("embedChunk: missing chunkText");
  }

  const { clientId, clientToken } = await getClientCredentials();
  const url = joinUrl(baseUrl, "/internal/embed");

  try {
    const { data } = await axios.post(
      url,
      { chunkText },
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
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw formatAxiosError(err);
    }
    throw err;
  }
}

module.exports = { handler };
