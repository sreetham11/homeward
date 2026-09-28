// Multi-provider LLM layer with auto-failover.
//
// Chain order: Groq (free, default) -> OpenAI -> Gemini -> Grok (xAI).
// Groq, OpenAI, Grok, and Gemini (via its OpenAI-compatible endpoint) are all called through
// the same `openai` SDK client with a different baseURL/apiKey/model per tier — that's what
// makes the failover loop below a single generic function instead of four bespoke
// integrations.
//
// If a provider has no API key configured, it's skipped (not attempted). If a configured
// provider errors (bad key, rate limit, network), we log and fall through to the next tier.
// If every tier is unavailable or fails, callers get a thrown LLMUnavailableError — every
// caller in this codebase (planBuilder, deviation Layer B, escalate) catches that and drops
// to a local deterministic/templated fallback so the app still functions with zero keys.
//
// Gemini is also callable directly via callGeminiVision() below, bypassing this failover
// chain entirely — Stage 1 discharge-photo parsing and wound-photo description need real
// multimodal input, which the OpenAI-compatible chat tier here does not attempt to support.

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ProviderConfig {
  id: "groq" | "openai" | "gemini" | "xai";
  envKey: string;
  baseURL?: string;
  defaultModel: string;
  modelEnvOverride: string;
}

const PROVIDER_CHAIN: ProviderConfig[] = [
  {
    id: "groq",
    envKey: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    modelEnvOverride: "GROQ_MODEL",
  },
  {
    id: "openai",
    envKey: "OPENAI_API_KEY",
    baseURL: undefined, // OpenAI SDK default
    defaultModel: "gpt-4o-mini",
    modelEnvOverride: "OPENAI_MODEL",
  },
  {
    id: "gemini",
    envKey: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.5-flash",
    modelEnvOverride: "GEMINI_MODEL",
  },
  {
    id: "xai",
    envKey: "XAI_API_KEY",
    baseURL: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    modelEnvOverride: "XAI_MODEL",
  },
];

export class LLMUnavailableError extends Error {
  constructor(public attempts: { provider: string; error: string }[]) {
    super(
      `No LLM provider available or all failed: ${attempts
        .map((a) => `${a.provider} (${a.error})`)
        .join("; ")}`,
    );
    this.name = "LLMUnavailableError";
  }
}

function configuredProviders(): ProviderConfig[] {
  return PROVIDER_CHAIN.filter((p) => !!process.env[p.envKey]);
}

export function getProviderStatus(): { id: string; configured: boolean }[] {
  return PROVIDER_CHAIN.map((p) => ({
    id: p.id,
    configured: !!process.env[p.envKey],
  }));
}

export function isAnyChatProviderConfigured(): boolean {
  return configuredProviders().length > 0;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function clientFor(provider: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: process.env[provider.envKey],
    baseURL: provider.baseURL,
  });
}

export interface ChatOptions {
  temperature?: number;
  /** Ask the model to return raw JSON (no markdown fences). Not all providers enforce
   * this server-side, so callers should still parse defensively. */
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  provider: string;
  model: string;
}

/**
 * Try each configured provider in chain order, returning the first success.
 * Throws LLMUnavailableError if no provider is configured or every attempt failed —
 * callers are expected to catch this and use a local deterministic fallback.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  const providers = configuredProviders();
  const attempts: { provider: string; error: string }[] = [];

  if (providers.length === 0) {
    throw new LLMUnavailableError([{ provider: "none", error: "no API keys configured" }]);
  }

  for (const provider of providers) {
    const model = process.env[provider.modelEnvOverride] || provider.defaultModel;
    try {
      const client = clientFor(provider);
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens,
        ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      });
      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error("empty response");
      return { text, provider: provider.id, model };
    } catch (err) {
      attempts.push({
        provider: provider.id,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }

  throw new LLMUnavailableError(attempts);
}

/**
 * Strip markdown code fences (```json ... ```) that chat models commonly wrap JSON in,
 * even when not asked to. Best-effort — callers still JSON.parse and handle failure.
 */
export function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  return text.trim();
}

// --- Direct Gemini multimodal (vision) ---
// Not part of the failover chain: called directly by lib/parser.ts and lib/woundVision.ts
// because discharge-photo parsing and wound-photo description are only meaningful with a
// real vision-capable model. If GEMINI_API_KEY is unset, throws immediately so callers can
// fall back to text-only / manual-entry flows.

export interface GeminiVisionInput {
  prompt: string;
  imageBase64: string;
  mimeType: string;
}

export async function callGeminiVision(input: GeminiVisionInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LLMUnavailableError([{ provider: "gemini", error: "GEMINI_API_KEY not set" }]);
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });
  const result = await model.generateContent([
    input.prompt,
    { inlineData: { data: input.imageBase64, mimeType: input.mimeType } },
  ]);
  const text = result.response.text();
  if (!text) throw new Error("Gemini vision returned an empty response");
  return text;
}
