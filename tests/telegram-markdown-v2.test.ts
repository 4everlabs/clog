import { describe, expect, test } from "bun:test";
import {
  convertMarkdownToTelegramMarkdownV2,
  telegramMarkdownV2ParseMode,
} from "../apps/frontends/telegram/src/markdown-v2";

describe("Telegram MarkdownV2 conversion", () => {
  test("keeps markdown semantics while escaping Telegram punctuation", () => {
    expect(convertMarkdownToTelegramMarkdownV2("**Ship it** (v1.2)!"))
      .toBe("*Ship it* \\(v1\\.2\\)\\!");
  });

  test("degrades headings into bold and preserves ordered lists", () => {
    expect(convertMarkdownToTelegramMarkdownV2("# Deploy\n\n1. First step\n2. Second step"))
      .toBe("*Deploy*\n\n1\\. First step\n2\\. Second step");
  });

  test("converts inline links and escapes closing parentheses in destinations", () => {
    expect(convertMarkdownToTelegramMarkdownV2("Read [the docs](https://example.com/path(test)) now."))
      .toBe("Read [the docs](https://example.com/path(test\\)) now\\.");
  });

  test("escapes code safely inside fenced blocks", () => {
    expect(convertMarkdownToTelegramMarkdownV2("```ts\nconst value = `x`\n```"))
      .toBe("```ts\nconst value = \\`x\\`\n```");
  });

  test("exports the Telegram parse mode we send to the Bot API", () => {
    expect(telegramMarkdownV2ParseMode).toBe("MarkdownV2");
  });
});
