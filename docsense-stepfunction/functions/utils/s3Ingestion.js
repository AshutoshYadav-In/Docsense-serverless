/**
 * S3 keys for ingestion artifacts.
 *
 * Chunk batches : tenants/{tenantId}/{reference_id}/chunk-batches/{n}.json
 * Embedding parts: tenants/{tenantId}/{reference_id}/embeddings/{i}.json
 * Manifest       : ingestion-meta/{reference_id}.json  (deterministic from reference_id alone)
 *
 * Fallback (no tenants/ prefix): ingestion/{reference_id}/...
 */

const CHUNKS_BATCH_SIZE = 25;

function ingestionBaseKey(s3_key, reference_id) {
  const parts = String(s3_key || "")
    .split("/")
    .filter(Boolean);
  if (parts[0] === "tenants" && parts.length >= 2) {
    const tenantId = parts[1];
    return `tenants/${tenantId}/${reference_id}`;
  }
  return `ingestion/${reference_id}`;
}

/** Manifest key derivable from reference_id alone (embed Lambda uses this). */
function manifestKey(reference_id) {
  return `ingestion-meta/${reference_id}.json`;
}

function chunkBatchesPrefix(s3_key, reference_id) {
  return `${ingestionBaseKey(s3_key, reference_id)}/chunk-batches/`;
}

function chunkBatchFileKey(chunk_batches_prefix, batch_index) {
  return `${chunk_batches_prefix}${batch_index}.json`;
}

function embeddingsPartsPrefix(s3_key, reference_id) {
  return `${ingestionBaseKey(s3_key, reference_id)}/embeddings/`;
}

function embeddingPartKey(embeddings_parts_prefix, chunk_index) {
  return `${embeddings_parts_prefix}${chunk_index}.json`;
}

module.exports = {
  CHUNKS_BATCH_SIZE,
  ingestionBaseKey,
  manifestKey,
  chunkBatchesPrefix,
  chunkBatchFileKey,
  embeddingsPartsPrefix,
  embeddingPartKey,
};
