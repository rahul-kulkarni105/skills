import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../src/sha.js";

describe("canonicalSha256", () => {
  it("is stable for ascii LF input", () => {
    expect(canonicalSha256("hello\nworld\n")).toBe(canonicalSha256("hello\nworld\n"));
  });

  it("LF, CRLF, and CR all hash to the same value", () => {
    const lf = canonicalSha256("a\nb\nc\n");
    const crlf = canonicalSha256("a\r\nb\r\nc\r\n");
    const cr = canonicalSha256("a\rb\rc\r");
    expect(crlf).toBe(lf);
    expect(cr).toBe(lf);
  });

  it("strips a leading UTF-8 BOM", () => {
    const withoutBom = canonicalSha256("# heading\n");
    const withBom = canonicalSha256(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# heading\n", "utf8")]));
    expect(withBom).toBe(withoutBom);
  });

  it("does not strip a BOM that appears mid-buffer", () => {
    const inner = canonicalSha256(Buffer.from("a\u{feff}b", "utf8"));
    const plain = canonicalSha256("ab");
    expect(inner).not.toBe(plain);
  });

  it("treats string and equivalent utf-8 buffer identically", () => {
    const s = "résumé\nfoo\n";
    expect(canonicalSha256(s)).toBe(canonicalSha256(Buffer.from(s, "utf8")));
  });

  it("emits 64 lowercase hex characters", () => {
    const out = canonicalSha256("anything");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("known vector: empty string", () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(canonicalSha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("known vector: 'abc' with LF", () => {
    // After CRLF normalization 'abc\n' is unchanged. sha256 of bytes 61 62 63 0a:
    // edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb
    expect(canonicalSha256("abc\n")).toBe(
      "edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb",
    );
    // Same content with CRLF must match.
    expect(canonicalSha256("abc\r\n")).toBe(
      "edeaaff3f1774ad2888673770c6d64097e391bc362d7d6fb34982ddf0efd18cb",
    );
  });

  it("preserves binary-ish bytes outside CR/LF", () => {
    const bytes = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const a = canonicalSha256(bytes);
    const b = canonicalSha256(bytes);
    expect(a).toBe(b);
    expect(a).not.toBe(canonicalSha256(""));
  });
});
