// Tests for chatCompletion()'s provider-failover loop itself (chain order, skip-when-unconfigured,
// fall-through-on-error, throw-when-all-fail) — as opposed to every OTHER test file in this repo
// (deviation.test.ts, parser.test.ts, askHomeward.test.ts), which mocks "./llm" wholesale to test
// how CALLERS degrade, and therefore never actually exercises this loop. See CLAUDE.md's "Multi-
// provider LLM layer" section and lib/llm.ts's own file header for the chain contract this proves.
//
// The `openai` SDK is mocked at the module level (not "./llm") so the real chatCompletion() runs
// end-to-end against a fake client — no real network calls. `@google/generative-ai` is mocked too
// purely so importing lib/llm.ts (which imports it at module scope for callGeminiVision) can't
// have any real side effect; chatCompletion() never touches it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  const MockOpenAI = vi.fn().mockImplementation((config: { apiKey?: string; baseURL?: string }) => ({
    __config: config,
    chat: { completions: { create: mockCreate } },
  }));
  return { default: MockOpenAI, OpenAI: MockOpenAI };
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(),
}));

import OpenAI from "openai";
import { chatCompletion, LLMUnavailableError } from "./llm";

const PROVIDER_ENV_KEYS = [
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
] as const;
const ORIGINAL_ENV: Record<string, string | undefined> = {};
for (const key of PROVIDER_ENV_KEYS) ORIGINAL_ENV[key] = process.env[key];

function setConfiguredProviders(keys: (typeof PROVIDER_ENV_KEYS)[number][]) {
  for (const key of PROVIDER_ENV_KEYS) {
    if (keys.includes(key)) process.env[key] = "test-key";
    else delete process.env[key];
  }
}

function successResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

beforeEach(() => {
  mockCreate.mockReset();
  vi.mocked(OpenAI).mockClear();
});

afterEach(() => {
  for (const key of PROVIDER_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

const MESSAGES = [{ role: "user" as const, content: "hello" }];

describe("chatCompletion — falls through to the next configured provider on error", () => {
  it("tries Groq first, and on failure falls through to OpenAI", async () => {
    setConfiguredProviders(["GROQ_API_KEY", "OPENAI_API_KEY"]);
    mockCreate
      .mockRejectedValueOnce(new Error("groq rate limited"))
      .mockResolvedValueOnce(successResponse("hello from openai"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("openai");
    expect(result.text).toBe("hello from openai");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("falls through across three tiers when the first two fail", async () => {
    setConfiguredProviders(["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]);
    mockCreate
      .mockRejectedValueOnce(new Error("groq down"))
      .mockRejectedValueOnce(new Error("openai down"))
      .mockResolvedValueOnce(successResponse("hello from gemini"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("gemini");
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("falls through all the way to Grok (xAI) when every earlier tier fails", async () => {
    setConfiguredProviders(["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY"]);
    mockCreate
      .mockRejectedValueOnce(new Error("groq down"))
      .mockRejectedValueOnce(new Error("openai down"))
      .mockRejectedValueOnce(new Error("gemini down"))
      .mockResolvedValueOnce(successResponse("hello from grok"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("xai");
    expect(result.text).toBe("hello from grok");
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });
});

describe("chatCompletion — an unconfigured provider is skipped, not attempted", () => {
  it("never calls the client for a provider with no env key set", async () => {
    // Groq is first in chain order but has no key here — only OpenAI is configured.
    setConfiguredProviders(["OPENAI_API_KEY"]);
    mockCreate.mockResolvedValueOnce(successResponse("hi"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("openai");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Only one client should ever have been constructed — for the configured provider.
    expect(vi.mocked(OpenAI)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(OpenAI).mock.calls[0]?.[0]).toMatchObject({ apiKey: "test-key" });
  });

  it("skips every unconfigured tier and only attempts the one configured provider, wherever it sits in chain order", async () => {
    // Grok (xai) is last in chain order; Groq/OpenAI/Gemini are all unconfigured.
    setConfiguredProviders(["XAI_API_KEY"]);
    mockCreate.mockResolvedValueOnce(successResponse("hi from grok"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("xai");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("never calls the client for xAI (Grok) when XAI_API_KEY is not set", async () => {
    setConfiguredProviders(["GROQ_API_KEY"]);
    mockCreate.mockResolvedValueOnce(successResponse("hi from groq"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("groq");
    // Only one client should ever have been constructed — xAI, last in chain order and
    // unconfigured here, must never be attempted.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(OpenAI)).toHaveBeenCalledTimes(1);
  });

  it("is used as the fallback when it's the only configured provider, even sitting last in chain order", async () => {
    setConfiguredProviders(["XAI_API_KEY"]);
    mockCreate.mockResolvedValueOnce(successResponse("hi from grok"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("xai");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(OpenAI).mock.calls[0]?.[0]).toMatchObject({
      apiKey: "test-key",
      baseURL: "https://api.x.ai/v1",
    });
  });
});

describe("chatCompletion — all configured providers fail", () => {
  it("throws LLMUnavailableError with one attempt entry per configured provider, in chain order", async () => {
    setConfiguredProviders(["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY"]);
    mockCreate.mockRejectedValue(new Error("boom"));

    await expect(chatCompletion(MESSAGES)).rejects.toThrow(LLMUnavailableError);
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it("the thrown error's attempts list names every provider that was tried and its error", async () => {
    setConfiguredProviders(["GROQ_API_KEY", "OPENAI_API_KEY"]);
    mockCreate
      .mockRejectedValueOnce(new Error("groq exploded"))
      .mockRejectedValueOnce(new Error("openai exploded"));

    let caught: LLMUnavailableError | null = null;
    try {
      await chatCompletion(MESSAGES);
    } catch (err) {
      caught = err as LLMUnavailableError;
    }

    expect(caught).toBeInstanceOf(LLMUnavailableError);
    expect(caught?.attempts).toEqual([
      { provider: "groq", error: "groq exploded" },
      { provider: "openai", error: "openai exploded" },
    ]);
  });

  it("throws LLMUnavailableError immediately, with no client call at all, when zero providers are configured", async () => {
    setConfiguredProviders([]);

    await expect(chatCompletion(MESSAGES)).rejects.toThrow(LLMUnavailableError);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(vi.mocked(OpenAI)).not.toHaveBeenCalled();
  });
});

describe("chatCompletion — a succeeding first provider short-circuits the chain", () => {
  it("never calls a later configured provider once the first one succeeds", async () => {
    setConfiguredProviders(["GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY"]);
    mockCreate.mockResolvedValueOnce(successResponse("groq answered"));

    const result = await chatCompletion(MESSAGES);

    expect(result.provider).toBe("groq");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
