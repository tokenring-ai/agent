import type { InteractionRequest } from "../AgentEvents.ts";

/** What a masked answer is recorded as in the agent's history. */
export const REDACTED_ANSWER = "••••••••";

type QuestionLike = { type: string; masked?: boolean; sections?: Array<{ name: string; fields: Record<string, QuestionLike> }> };

/**
 * The answer to keep in the agent's event history. A masked question (an API key, a token, a password) is
 * answered for the code that asked, but the history — which is shown in the transcript, streamed to other
 * clients and saved in checkpoints — keeps only a placeholder. Form answers have each masked field replaced.
 */
export function redactMaskedAnswer(interaction: InteractionRequest | undefined, result: unknown): unknown {
  if (interaction?.type !== "question") return result;
  const question = interaction.question as QuestionLike;
  if (question.type === "text") {
    return question.masked && typeof result === "string" && result !== "" ? REDACTED_ANSWER : result;
  }
  if (question.type !== "form" || !question.sections || typeof result !== "object" || result === null) return result;
  let redacted: Record<string, unknown> | undefined;
  for (const section of question.sections) {
    const answers = (result as Record<string, unknown>)[section.name];
    if (typeof answers !== "object" || answers === null) continue;
    for (const [field, fieldQuestion] of Object.entries(section.fields)) {
      const value = (answers as Record<string, unknown>)[field];
      if (fieldQuestion.type !== "text" || !fieldQuestion.masked || typeof value !== "string" || value === "") continue;
      redacted ??= structuredClone(result as Record<string, unknown>);
      (redacted[section.name] as Record<string, unknown>)[field] = REDACTED_ANSWER;
    }
  }
  return redacted ?? result;
}
