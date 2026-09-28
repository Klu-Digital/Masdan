import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { z } from "zod";

const mockEnv = vi.hoisted(() => ({
  AI_PROVIDER_API_KEY: undefined as string | undefined,
  CLOUDFLARE_AI_GATEWAY_TOKEN: undefined as string | undefined,
  CLOUDFLARE_AI_GATEWAY_URL: undefined as string | undefined,
  QUICK_TRANSACTION_AI_MODEL: undefined as string | undefined,
}));

vi.mock("@masdan/env/server", () => ({ env: mockEnv }));

const { AiError, completeJson, isAiConfigured } = await import("./gateway");

const GATEWAY = "https://gateway.ai.cloudflare.com/v1/acct/masdan/compat";
const schema = z.strictObject({ amount: z.string().nullable() });

const completion = (content: string | null) =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        index: 0,
        message: { content, role: "assistant" },
      },
    ],
    created: 0,
    id: "chatcmpl-test",
    model: "test",
    object: "chat.completion",
  });

const fetchMock = vi.fn<typeof fetch>();

const call = () =>
  completeJson({
    feature: "quickTransaction",
    messages: [{ content: "dinner 400", role: "user" }],
    name: "quick_transaction",
    schema,
    timeoutMs: 50,
  });

beforeEach(() => {
  mockEnv.AI_PROVIDER_API_KEY = undefined;
  mockEnv.CLOUDFLARE_AI_GATEWAY_TOKEN = "gateway-token";
  mockEnv.CLOUDFLARE_AI_GATEWAY_URL = GATEWAY;
  mockEnv.QUICK_TRANSACTION_AI_MODEL = "workers-ai/@cf/meta/llama-3.1-8b";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAiConfigured", () => {
  it("needs both the gateway and the feature's own model", () => {
    expect(isAiConfigured("quickTransaction")).toBe(true);

    mockEnv.QUICK_TRANSACTION_AI_MODEL = undefined;
    expect(isAiConfigured("quickTransaction")).toBe(false);

    mockEnv.QUICK_TRANSACTION_AI_MODEL = "openai/gpt-4.1-mini";
    mockEnv.CLOUDFLARE_AI_GATEWAY_URL = undefined;
    expect(isAiConfigured("quickTransaction")).toBe(false);
  });
});

describe("completeJson", () => {
  it("refuses without calling out when unconfigured", async () => {
    mockEnv.QUICK_TRANSACTION_AI_MODEL = undefined;

    await expect(call()).rejects.toMatchObject({ reason: "unavailable" });
    await expect(call()).rejects.toBeInstanceOf(AiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts an OpenAI chat completion to the gateway with the feature's model", async () => {
    fetchMock.mockResolvedValue(completion('{"amount":"400"}'));

    await expect(call()).resolves.toEqual({ amount: "400" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${GATEWAY}/chat/completions`);
    const headers = new Headers(init?.headers);
    expect(headers.get("cf-aig-authorization")).toBe("Bearer gateway-token");
    // With no provider key the gateway authenticates upstream (BYOK).
    expect(headers.get("authorization")).toBeNull();
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "workers-ai/@cf/meta/llama-3.1-8b",
      response_format: {
        json_schema: { name: "quick_transaction", strict: true },
        type: "json_schema",
      },
      temperature: 0,
    });
  });

  it("follows a model change without any caller change", async () => {
    mockEnv.QUICK_TRANSACTION_AI_MODEL = "openai/gpt-4.1-mini";
    mockEnv.AI_PROVIDER_API_KEY = "sk-provider";
    fetchMock.mockResolvedValue(completion('{"amount":null}'));

    await call();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "openai/gpt-4.1-mini",
    });
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer sk-provider"
    );
  });

  it.each([
    ["no content", null],
    ["prose instead of JSON", "Sure! The amount is 400."],
    ["JSON of the wrong shape", '{"amount":400}'],
    ["extra keys", '{"amount":"400","accountId":"x"}'],
  ])("rejects %s as malformed", async (_, content) => {
    fetchMock.mockResolvedValue(completion(content));

    await expect(call()).rejects.toMatchObject({ reason: "malformed" });
  });

  it("surfaces an upstream error without retrying", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: "overloaded" } }, { status: 503 })
    );

    await expect(call()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout", async () => {
    // Answers only once the client aborts — which is only the timeout.
    fetchMock.mockImplementation(async (_, init) => {
      if (init?.signal) {
        await once(init.signal, "abort");
      }
      throw new DOMException("aborted", "AbortError");
    });

    await expect(call()).rejects.toThrow();
  });
});
