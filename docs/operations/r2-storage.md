# Cloudflare R2 storage guide

## MVP boundary

The app supports private identity and teaching-skill verification evidence. It validates PDF, PNG, JPEG, and WebP content signatures, caps each file at 8 MiB, writes opaque object keys, audits Admin reads, and deletes evidence 180 days after a decision through the retention worker. The 180-day duration is a proposal that must be checked against the product's final privacy policy before production evidence is collected. Never use a public bucket for private material.

## Bucket setup checklist

1. Create separate private buckets for development, preview, and production in the intended Cloudflare account/region.
2. Create a scoped R2 API token per environment with access only to the matching bucket and the minimum object read/write permissions required by that environment.
3. Keep account IDs, access key IDs, secrets, and bucket names in the environment's private secret store. Names in `.env.example` are placeholders, not credentials.
4. Do not enable public bucket access. Keep CORS disabled; uploads pass through the authenticated application route.
5. Store opaque object keys and metadata in PostgreSQL. Do not put names, email addresses, or sensitive case details in keys.
6. The Admin evidence route audits access and redirects to a 60-second signed read. Do not log the signed URL.
7. Schedule `npm run verification:retention` daily on the local host. Confirm the run succeeds and add bucket lifecycle deletion after the final retention rule is approved.
8. Test denied anonymous access, expired signatures, least-privilege tokens, and restoration/retention behavior in a non-production bucket.

## Planned application variables

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` in the ignored app `.env` or the deployment secret store. The app signs S3-compatible requests using Node's built-in crypto; no R2 SDK is required. Evidence upload returns an unavailable message until all four values work against the private bucket.
