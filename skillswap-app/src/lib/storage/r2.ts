import "server-only";
import { createHash, createHmac } from "node:crypto";

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
    throw new Error("Private evidence storage is not configured.");
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(
      ([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function signPrivateR2Url(
  method: "GET" | "PUT" | "DELETE",
  objectKey: string,
  expiresSeconds = 60,
) {
  const { accountId, accessKeyId, secretAccessKey, bucket } = config();
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const scope = `${date}/${region}/${service}/aws4_request`;
  const encodedPath = encodePath(`/${bucket}/${objectKey}`);
  const url = new URL(`https://${host}${encodedPath}`);
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  });
  const query = canonicalQuery(params);
  const canonicalRequest = `${method}\n${encodedPath}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service),
    "aws4_request",
  );
  params.set(
    "X-Amz-Signature",
    createHmac("sha256", signingKey).update(stringToSign).digest("hex"),
  );
  url.search = params.toString();
  return url;
}

export async function uploadPrivateR2Object(objectKey: string, body: Buffer, contentType: string) {
  const response = await fetch(signPrivateR2Url("PUT", objectKey), {
    method: "PUT",
    headers: { "content-type": contentType },
    body: new Uint8Array(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    const code = responseBody.match(/<Code>([^<]+)<\/Code>/)?.[1];
    const message = responseBody.match(/<Message>([^<]+)<\/Message>/)?.[1];
    // Keep storage diagnostics useful without ever logging the signed URL or credentials.
    throw new Error(
      `Private media upload failed (HTTP ${response.status}${code ? `, ${code}` : ""}${message ? `: ${message.slice(0, 160)}` : ""}).`,
    );
  }
}

export async function deletePrivateR2Object(objectKey: string) {
  const response = await fetch(signPrivateR2Url("DELETE", objectKey), {
    method: "DELETE",
    cache: "no-store",
  });
  if (!response.ok && response.status !== 404)
    throw new Error(`Private evidence deletion failed (${response.status}).`);
}
