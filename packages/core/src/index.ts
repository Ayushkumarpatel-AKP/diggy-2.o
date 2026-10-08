/**
 * @diggy/core — the brain.
 *
 * Provider-agnostic model layer (Groq primary → NVIDIA NIM failover), the
 * planner + multi-step agent loop, prompt layering, memory/compaction and the
 * on-demand skill loader. Nothing here imports the DOM, `chrome`, `three` or the
 * vault, so it runs unchanged in the MV3 service worker, the desktop brain and
 * Vitest. Provider keys are read server-side only — never bundled.
 *
 * // INTERFACE FOR INTEGRATION — exported surface (repeat, keep in sync):
 * //
 * //   import type { Provider, ProviderRegistry, ChatRequest, ChatResult, ChatMessage, ToolSchema } from "@diggy/shared";
 * //
 * //   createGroqProvider(config?: { apiKey?, baseURL?, model?, sttModel?, headers?, fetch? }): Provider
 * //   createNvidiaNimProvider(config?: { apiKey?, baseURL?, model?, headers?, fetch? }): Provider
 * //   createOpenAICompatibleProvider(config): Provider
 * //   createCatalogProvider(id: string, config?): Provider
 * //   listCatalog(): ProviderCatalogEntry[]
 * //   defaultFailoverChain(): string[]              // ["groq", "nvidia-nim"]
 * //   createBrainRegistry(config?): FailoverRegistry
 * //   createRegistry(options?): FailoverRegistry
 * //
 * //   class FailoverRegistry implements ProviderRegistry {
 * //     register(provider: Provider): void
 * //     get(id: string): Provider | undefined
 * //     chain(): Provider[]                          // healthy first
 * //     chat(req: ChatRequest): Promise<ChatResult>  // failover + retry + accounting
 * //     chatWithProvider(req: ChatRequest): Promise<{ provider: Provider; result: ChatResult }>
 * //     metrics(id: string): ProviderMetrics
 * //     allMetrics(): ProviderMetrics[]
 * //     checkHealth(id?: string): Promise<ProviderHealth | undefined>
 * //   }
 * //
 * //   runBrain(options: RunBrainOptions): Promise<RunBrainResult>
 * //     // options.model: { chat(req) }, options.tools: AgentTool[], options.stepBudget (default 130, cap 195)
 * //     // result.status: "done" | "budget-exceeded" | "cancelled" | "error"
 * //     // result.continue?: { continue: true, reason: "step-budget" | "wall-clock", checkpoint }
 * //
 * //   buildSystemPrompt(options?): string            // persona → layers → time → context
 * //   temperatureFor(mode: "browser-control"|"ask"|"vision"): number  // 0.15 | 0.3 | 0
 * //
 * //   new TabConversationStore(), new UserMemory(), new SkillLoader()
 * //   compactWithOverflowRecovery(messages, options), capToolResult(text, maxChars)
 */
export * from "./config.js";
export * from "./errors.js";
export * from "./providers/index.js";
export * from "./registry.js";
export * from "./prompt.js";
export * from "./orchestrator.js";
export * from "./skills.js";
export * from "./memory/index.js";
