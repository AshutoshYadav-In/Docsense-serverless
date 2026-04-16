# DocSense ingestion (Step Functions)

AWS Step Functions **Standard** workflow that downloads a PDF from S3, extracts text, chunks it (200 words with 40-word overlap), calls your Java API for embeddings, then bulk-inserts vectors. Intermediate chunk batches are stored in S3 to keep Step Functions state small.

## Prerequisites

- **Node.js** 20 or newer
- **AWS account** with permissions to deploy CloudFormation stacks, Lambda, Step Functions, IAM, and Logs
- **AWS CLI** configured (`aws configure`) or equivalent credentials in the environment used by Serverless
- **Backend Java API** reachable from Lambda (VPC / security groups if applicable) exposing the embed and bulk-insert endpoints used by this stack

## Project layout (files that matter)

| Path                                   | Role                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `serverless.yml`                       | Service name, Lambdas, IAM, Step Functions definition hook, `JAVA_API_BASE_URL` |
| `statemachine/ingestion.json`          | ASL: `ExtractAndChunk` → `GenerateEmbeddings` (Map) → `BulkInsertAndComplete`   |
| `functions/extractAndChunk/`           | PDF download, chunking, writes `batches/{n}.json` under a resolved S3 prefix    |
| `functions/embedChunk/`                | Reads batch files, calls embed API, writes embeddings back to S3                |
| `functions/bulkInsertAndComplete/`     | Loads all batch files, POSTs to bulk insert API                                 |
| `functions/utils/s3Ingestion.js`       | Batch size, S3 key helpers, `resolveBatchesPrefix`                              |
| `functions/utils/clientCredentials.js` | Loads API credentials from SSM at runtime                                       |
| `.env`                                 | **Not committed** — copy from `.env.example` and fill (see below)               |

## Environment variables (`.env`)

Copy `.env.example` to `.env` in this directory. The deploy and package scripts load it via `dotenv-cli`.

| Variable            | Required           | Purpose                                                                                                             |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION`        | **Yes**            | Region for Serverless provider (`serverless.yml` → `provider.region`)                                               |
| `JAVA_API_BASE_URL` | **Yes** for deploy | Base URL of the Java API (no trailing slash required). Used by **embedChunk** and **bulkInsertAndComplete** Lambdas |

Example:

```bash
AWS_REGION=ap-south-1
JAVA_API_BASE_URL=https://your-java-api.example.com
```

Optional: `AWS_ACCOUNT_ID` — not read by `serverless.yml` today; useful only for your own notes or scripts.

## AWS resources you must create before (or alongside) deploy

### 1. SSM Parameter Store (runtime credentials)

Lambdas read these at **runtime** (not from `.env`):

| Parameter name           | Typical type   |
| ------------------------ | -------------- |
| `/docsense-client-id`    | `String`       |
| `/docsense-client-token` | `SecureString` |

If these are missing or empty, embedding steps fail. IAM in `serverless.yml` already allows `ssm:GetParameter` on those names and KMS decrypt for the default SSM key.

### 2. S3 bucket and object keys

- The **bucket name** is **not** fixed in Serverless; each execution passes `bucket` in the input.
- The stack’s Lambdas are granted `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::*/*` (adjust in production if you need a tighter resource scope).

### 3. Java API

- Base URL is `JAVA_API_BASE_URL`. Lambdas call:
  - **POST** `{JAVA_API_BASE_URL}/api/internal/embed` (embedChunk)
  - **POST** `{JAVA_API_BASE_URL}/api/internal/bulk-insert` (bulkInsertAndComplete)

## Install and deploy

From this directory:

```bash
npm install
npm run deploy
```

That runs `dotenv -e .env -- serverless deploy` (see `package.json`).

Useful variants:

```bash
# Validate packaging without uploading
npm run package

# Specific stage (if you add stages in serverless.yml)
npx dotenv -e .env -- serverless deploy --stage prod
```

After deploy, note the **Step Functions state machine** name (see `serverless.yml`: `DocSenseIngestion`) and the **Lambda** ARNs in the stack outputs or AWS console.

## Step Functions execution input (parameters)

Start an execution with JSON input using **snake_case** keys. Typical shape:

| Field                              | Required    | Description                                                                                                                   |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `reference_id`                     | Yes         | Document / job reference (UUID or string)                                                                                     |
| `bucket`                           | Yes         | S3 bucket containing the PDF                                                                                                  |
| `s3_key`                           | Yes         | Object key of the PDF                                                                                                         |
| `file_name` or `original_filename` | Recommended | Original filename (used for derived paths if no folder prefix is set)                                                         |
| `folder_name`                      | Optional    | Full S3 key prefix for workspace, e.g. `tenants/{tenantId}/{reference_id}/` — if it contains `/`, `batches/` is appended here |
| `s3_folder_prefix`                 | Optional    | Same idea as a full-path `folder_name`; used when `folder_name` is not a multi-segment path                                   |

Batch files are written under:

`{resolved_prefix}batches/0.json`, `1.json`, …

Resolution order is implemented in `functions/utils/s3Ingestion.js` (`resolveBatchesPrefix`).

## Operations

- **Logs**: Step Functions logging goes to CloudWatch; log group name is configured in `serverless.yml` (`/aws/vendedlogs/states/docsense-ingestion`).
- **Tuning**: Chunk size and overlap are constants in `functions/extractAndChunk/handler.js`; batch size (chunks per S3 file) is `BATCH_SIZE` in `functions/utils/s3Ingestion.js`.

## Troubleshooting

| Issue                       | What to check                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Deploy fails on missing env | `AWS_REGION` and `JAVA_API_BASE_URL` in `.env`                                                                   |
| Embed / bulk 401 or 403     | SSM parameters and values; Lambda in correct VPC/security group to reach API                                     |
| S3 access denied            | Bucket policy and IAM; keys must match granted ARNs if you tighten IAM                                           |
| `States.DataLimitExceeded`  | Should not occur if batches stay in S3; ensure execution uses current ASL (Map per batch, not per giant payload) |
