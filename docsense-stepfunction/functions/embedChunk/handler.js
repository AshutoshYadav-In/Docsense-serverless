const { getClientCredentials } = require("../utils/clientCredentials");

/**
 * embedChunk (Map iterator target)
 *
 * Per-iteration input (from Map ItemSelector):
 *   chunkText, referenceId, fileName
 *
 * Will implement:
 * - const { clientId, clientToken } = await getClientCredentials();
 * - POST `${process.env.JAVA_API_BASE_URL}/internal/embed` (JAVA_API_BASE_URL is set only on this Lambda)
 * - Headers: { "X-Client-Id": clientId, "X-Client-Token": clientToken }
 * - Body: { chunkText }
 *
 * Return the Java response body for the step output (e.g. chunkText + embedding array)
 * so BulkInsertAndComplete can build chunksWithEmbeddings.
 */
async function handler(event) {
  await getClientCredentials(); // warm cache; remove if you fetch inline before axios
  throw new Error("embedChunk: not implemented");
}

module.exports = { handler };
