import { describe, expect, it } from "vitest";
import { stripControlCharacters } from "./sanitizeText.js";

describe("stripControlCharacters", () => {
    it("removes control characters while preserving common whitespace", () => {
        expect(stripControlCharacters("ok\u0000\tstill\nfine\r\u001Fdone")).toBe("ok\tstill\nfine\rdone");
    });

    it("removes ANSI escape sequences", () => {
        expect(stripControlCharacters("\u001B[31mfailed\u001B[0m")).toBe("failed");
    });
});
