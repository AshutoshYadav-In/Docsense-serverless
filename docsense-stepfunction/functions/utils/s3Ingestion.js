/**
 * S3 keys for ingestion — batch JSON under a single `batches/` folder.
 *
 * Preferred (caller-provided workspace prefix under bucket):
 *   {prefix}batches/{batch_index}.json
 *   prefix from folder_name when it is a full key path (contains "/"), e.g.
 *   "tenants/{tid}/{reference_id}/",
 *   else from s3_folder_prefix when set (same shape as above).
 *
 * Fallback (derive from s3_key + reference_id + file_name):
 *   tenants/{tid}/{reference_id}/{fileFolder}/batches/...
 */

const path = require("path/posix");
const BATCH_SIZE = 25;

/**
 * Stable folder segment from filename (e.g. "My Doc.pdf" -> "My-Doc").
 */
function fileFolderFromOriginalName(original_filename) {
  const base = path.basename(String(original_filename || "document"));
  const noExt = base.replace(/\.[^./]+$/, "");
  const safe = noExt
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return safe.length > 0 ? safe : "document";
}

function tenantIdFromS3Key(s3_key) {
  const parts = String(s3_key || "")
    .split("/")
    .filter(Boolean);
  if (parts[0] === "tenants" && parts.length >= 2) {
    return parts[1];
  }
  return null;
}

function ingestionBaseKey(s3_key, reference_id, file_name) {
  const fileFolder = fileFolderFromOriginalName(file_name);
  const tid = tenantIdFromS3Key(s3_key);
  if (tid) {
    return `tenants/${tid}/${reference_id}/${fileFolder}`;
  }
  return `ingestion/${reference_id}/${fileFolder}`;
}

function batchesPrefixFromParts(s3_key, reference_id, file_name) {
  return `${ingestionBaseKey(s3_key, reference_id, file_name)}/batches/`;
}

function normalizeFolderPrefix(prefix) {
  const s = String(prefix || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s : `${s}/`;
}

/**
 * True when folder_name is intended as an S3 object key prefix (e.g. tenants/.../ref/).
 * A bare UUID with no slashes is not treated as a prefix (use s3_folder_prefix or derivation).
 */
/**
 * Resolve batches key prefix from Step Functions event.
 * Uses folder_name when it looks like a full key prefix, else s3_folder_prefix, else derivation.
 */
function resolveBatchesPrefix(event) {
  const fromFolderName = event?.s3_folder_prefix;
  return `${normalizeFolderPrefix(fromFolderName)}batches/`;
}

function batchFileKey(batches_prefix, batch_index) {
  return `${batches_prefix}${batch_index}.json`;
}

module.exports = {
  BATCH_SIZE,
  fileFolderFromOriginalName,
  resolveBatchesPrefix,
  batchesPrefixFromParts,
  batchFileKey,
};
