/**
 * Loads DocSense API auth from SSM Parameter Store at runtime (not via serverless env).
 * Parameters: /docsense-client-id and /docsense-client-token (SecureString for token is typical).
 *
 * Results are cached for the lifetime of the Lambda container to avoid repeated
 * SSM calls (important for embedChunk, which runs once per chunk in the Map state).
 */

const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const PARAM_CLIENT_ID = "/docsense-client-id";
const PARAM_CLIENT_TOKEN = "/docsense-client-token";

let cachedPromise = null;

/**
 * @returns {Promise<{ clientId: string, clientToken: string }>}
 */
async function getClientCredentials() {
  if (!cachedPromise) {
    cachedPromise = fetchFromSsm();
  }
  return cachedPromise;
}

async function fetchFromSsm() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const ssm = new SSMClient({ region });

  const [idParam, tokenParam] = await Promise.all([
    ssm.send(
      new GetParameterCommand({
        Name: PARAM_CLIENT_ID,
        WithDecryption: true,
      })
    ),
    ssm.send(
      new GetParameterCommand({
        Name: PARAM_CLIENT_TOKEN,
        WithDecryption: true,
      })
    ),
  ]);

  const clientId = idParam.Parameter?.Value;
  const clientToken = tokenParam.Parameter?.Value;

  if (clientId == null || clientToken == null) {
    throw new Error(
      "SSM parameters /docsense-client-id and /docsense-client-token must return values"
    );
  }

  return { clientId, clientToken };
}

/** Clears cache (e.g. for tests). */
function clearClientCredentialsCache() {
  cachedPromise = null;
}

module.exports = {
  getClientCredentials,
  clearClientCredentialsCache,
  PARAM_CLIENT_ID,
  PARAM_CLIENT_TOKEN,
};
