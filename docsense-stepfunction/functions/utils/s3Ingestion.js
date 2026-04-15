/**
 * S3 keys for ingestion artifacts — unified batches folder.
 *
 * Layout: tenants/{tenantId}/{reference_id}/batches/{batch_index}.json
 * Fallback (no tenants/ prefix): ingestion/{reference_id}/batches/{batch_index}.json
 *
 * Each batch file is an array of { text, embedding } objects (25 per file).
 * Extract writes with embedding: null; embed Lambda fills in embeddings.
 */

const BATCH_SIZE = 25;

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

function batchesPrefix(s3_key, reference_id) {
  return `${ingestionBaseKey(s3_key, reference_id)}/batches/`;
}

function batchFileKey(batches_prefix, batch_index) {
  return `${batches_prefix}${batch_index}.json`;
}

module.exports = {
  BATCH_SIZE,
  ingestionBaseKey,
  batchesPrefix,
  batchFileKey,
};
