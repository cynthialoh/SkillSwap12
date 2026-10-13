export const profileImageMaxBytes = 4 * 1024 * 1024;
export const memberMediaMaxBytes = 8 * 1024 * 1024;

export function mediaMatchesSignature(type: string, bytes: Uint8Array) {
  const text = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  if (type === "image/png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (type === "video/mp4") return text(4, 8) === "ftyp";
  if (type === "video/webm") return bytes.slice(0, 4).join(",") === "26,69,223,163";
  return false;
}

export const memberMediaTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
]);
