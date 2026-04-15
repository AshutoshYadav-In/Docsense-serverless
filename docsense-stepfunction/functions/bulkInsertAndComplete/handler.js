const { getClientCredentials } = require("../utils/clientCredentials");

/**
 * BulkInsertAndComplete
 *
 * Input after Map + ResultPath:
 *   referenceId, fileName, chunks (optional), embeddingsResult: Array<embedChunk output>
 *
 * Will implement:
 * - const { clientId, clientToken } = await getClientCredentials();
 * - Map embeddingsResult items to { text, embedding } (rename chunkText → text if needed).
 * - POST `${process.env.JAVA_API_BASE_URL}/internal/bulk-insert` (JAVA_API_BASE_URL is set only on this Lambda)
 * - Headers: { "X-Client-Id": clientId, "X-Client-Token": clientToken }
 * - Body: { referenceId, fileName, chunksWithEmbeddings: [...] }
 *
 * Return Java response e.g. { status, referenceId, indexedCount, indexName }.
 */
async function handler(event) {
  await getClientCredentials();
  throw new Error("bulkInsertAndComplete: not implemented");
}

module.exports = { handler };
