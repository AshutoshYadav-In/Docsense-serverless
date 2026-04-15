/**
 * ExtractAndChunk
 *
 * Step Functions input (from Java):
 *   s3Key, referenceId, originalFilename, contentType, size, bucket
 *
 * Will implement:
 * - Download PDF from S3 (GetObject) using bucket + s3Key from the event.
 * - pdf-parse to extract text from the buffer.
 * - Split text into chunks of 500 words each (whitespace-separated words).
 *
 * Return value expected by the state machine:
 *   {
 *     referenceId: string,
 *     fileName: string,   // map from originalFilename
 *     chunks: string[]
 *   }
 */
async function handler(event) {
  throw new Error("extractAndChunk: not implemented");
}

module.exports = { handler };
