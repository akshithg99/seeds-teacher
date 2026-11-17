// Claude through the official Anthropic TypeScript SDK, loaded in the browser only when a key is set.
// The key is typed by the tester in Settings and kept in this browser only; it is never in the page source.
// shortcut: the key sits in the browser, which suits a prototype with one tester per device; a pilot
// needs a small server that holds the key and forwards requests.

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.5.0/+esm";
export const MODEL = "claude-opus-5-5";
export const KEY_REJECTED = "The key was not accepted. Check that you copied all of it.";
// Opus 5.5 may decline a request in a safety category; the API then retries it on a fallback model.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
// US$ per million tokens for claude-opus-5-5 (FR-105 cost estimate)
const PRICE_IN = 4, PRICE_OUT = 20;

export class Claude {
  constructor(key = "") { this.key = ""; this.client = null; this.loading = null; this.listeners = new Set(); this.configure(key); }

  get available() { return !!this.key; }
  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); }

  configure(key) {
    this.key = (key || "").trim();
    this.client = null;
    this.loading = null;
    this.listeners.forEach((f) => f(this.available));
  }

  async sdk() {
    if (this.client) return this.client;
    if (!this.loading) {
      this.loading = import(SDK_URL).then((m) => {
        const Anthropic = m.default || m.Anthropic;
        // The page runs in the tester's own browser with their own key; there is no server in this prototype.
        this.client = new Anthropic({ apiKey: this.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
        return this.client;
      }).catch((e) => { this.loading = null; throw new Error("Could not load the Claude library. Check the connection. " + (e.message || "")); });
    }
    return this.loading;
  }

  /** Checks the key without generating anything. Returns null when it works, else a plain message. */
  async test() {
    if (!this.key) return "No key is set.";
    try { const c = await this.sdk(); await c.models.retrieve(MODEL); return null; }
    catch (e) { return plainError(e); }
  }

  /** One request that returns JSON matching `schema` (structured outputs), or plain text when schema is null. */
  async complete(system, user, { schema = null, maxTokens = 16000, effort = "medium" } = {}) {
    const c = await this.sdk();
    const params = {
      model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }],
      output_config: schema ? { effort, format: { type: "json_schema", schema } } : { effort }, ...FALLBACK,
    };
    const msg = await c.beta.messages.create(params);
    if (msg.stop_reason === "refusal") throw new Error("Claude declined this request.");
    if (msg.stop_reason === "max_tokens") throw new Error("The draft was too long and got cut off.");
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return schema ? JSON.parse(text) : text.trim();
  }

  /**
   * One agent turn: stream the reply, run tool calls through `exec`, and loop until Claude answers.
   * `history` is appended in place with whole assistant turns, so thinking blocks go back unchanged.
   * Text deltas go to onText as they arrive (the orchestrator speaks them sentence by sentence).
   */
  async agentTurn(system, history, tools, onText, exec, signal) {
    const c = await this.sdk();
    const usage = { model: MODEL, inputTokens: 0, outputTokens: 0, estCostUsd: 0 };
    for (let round = 0; round < 6; round++) {
      const stream = c.beta.messages.stream({
        model: MODEL, max_tokens: 8000, system, messages: history, tools,
        output_config: { effort: "low" }, ...FALLBACK,
      }, { signal });
      stream.on("text", (d) => onText(d));
      const msg = await stream.finalMessage();
      usage.inputTokens += msg.usage.input_tokens || 0;
      usage.outputTokens += msg.usage.output_tokens || 0;
      history.push({ role: "assistant", content: msg.content });
      if (msg.stop_reason === "refusal") { onText(" I can't help with that here."); break; }
      if (msg.stop_reason !== "tool_use") break;
      const results = [];
      for (const b of msg.content) {
        if (b.type !== "tool_use") continue;
        let out;
        try { out = await exec(b.name, b.input || {}); } catch (e) { out = "Tool failed: " + (e.message || e); }
        results.push({ type: "tool_result", tool_use_id: b.id, content: out });
      }
      history.push({ role: "user", content: results });
    }
    usage.estCostUsd = (usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT) / 1e6;
    return usage;
  }
}

/** Tool definition in the Messages API shape. Inputs are tiny enums and ids, validated by the engine. */
export const tool = (name, description, properties = {}, required = []) => ({
  name, description, input_schema: { type: "object", properties, required, additionalProperties: false },
});

export function plainError(e) {
  const status = e && (e.status || (e.error && e.error.status));
  const msg = String((e && e.message) || e || "");
  if (status === 401 || /authentication|invalid x-api-key|api key/i.test(msg)) return KEY_REJECTED;
  if (status === 429) return "Claude is busy or the key's limit is reached. Try again in a minute.";
  if (/fetch|network|load|connection|timed? ?out/i.test(msg)) return "The connection is weak or off.";
  return "Reason: " + msg.slice(0, 140) + ".";
}
