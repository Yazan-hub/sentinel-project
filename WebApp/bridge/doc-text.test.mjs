import { describe, it, expect } from "vitest";
import { extractText } from "./doc-text.mjs";

const buf = (s) => Buffer.from(s, "utf8");

describe("extractText", () => {
  it("reads a .txt file as a single page", async () => {
    const out = await extractText(buf("hello world"), "eir.txt");
    expect(out.kind).toBe("text");
    expect(out.pages).toEqual([{ page: 1, text: "hello world" }]);
  });

  it("reads a .md file the same way", async () => {
    const out = await extractText(buf("# Heading\n\nbody"), "eir.md");
    expect(out.kind).toBe("text");
    expect(out.pages[0].text).toContain("# Heading");
  });

  it("rejects an unsupported extension with 400", async () => {
    await expect(extractText(buf("x"), "eir.xlsx")).rejects.toMatchObject({ status: 400 });
  });

  it("tells .doc users to save as .docx", async () => {
    await expect(extractText(buf("x"), "old.doc")).rejects.toMatchObject({ status: 400, message: expect.stringContaining(".docx") });
  });

  it("rejects a file with no extractable text with 400 naming OCR", async () => {
    await expect(extractText(buf("   "), "blank.txt")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("OCR") });
  });
});
