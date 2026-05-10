import { createHash } from "node:crypto";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Canonical sha256 used by both the manifest builder and the runtime
 * verifier. Two normalizations and only two:
 *
 *   1. Strip a leading UTF-8 BOM if present.
 *   2. Convert CRLF (0x0d 0x0a) to LF (0x0a).
 *
 * No trim, no encoding conversion, no Unicode normalization. The output is
 * lowercase hex. This is the single source of truth for hashing — every
 * other module imports from here.
 */
export function canonicalSha256(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  const stripped = stripUtf8Bom(buf);
  const normalized = normalizeCrlfToLf(stripped);
  return createHash("sha256").update(normalized).digest("hex");
}

function stripUtf8Bom(buf: Buffer): Buffer {
  if (buf.length >= 3 && buf[0] === UTF8_BOM[0] && buf[1] === UTF8_BOM[1] && buf[2] === UTF8_BOM[2]) {
    return buf.subarray(3);
  }
  return buf;
}

function normalizeCrlfToLf(buf: Buffer): Buffer {
  let hasCr = false;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d) {
      hasCr = true;
      break;
    }
  }
  if (!hasCr) return buf;

  const out = Buffer.allocUnsafe(buf.length);
  let w = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    if (b === 0x0d && i + 1 < buf.length && buf[i + 1] === 0x0a) {
      continue;
    }
    if (b === 0x0d) {
      out[w++] = 0x0a;
      continue;
    }
    out[w++] = b;
  }
  return out.subarray(0, w);
}
