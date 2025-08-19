import {execute as runChat} from "@token-ring/ai-client/runChat";
import {Registry} from "@token-ring/registry";

/**
 * Research agent that gathers and synthesizes information on a given topic
 */
export async function researchAgent(input: string, registry: Registry) {
  // Example implementation that uses AI to perform research
  const result = await runChat({
    input: `I need you to research the following topic and provide a comprehensive summary: ${input}`,
    systemPrompt: "You are a research specialist tasked with gathering and synthesizing information.",
    model: "gpt-4",
  }, registry);

  // runChat returns [output, response], we extract them here
  const [output, response] = result;

  return {
    output,
    metadata: {
      usage: response.usage,
      timing: response.timing,
    }
  };
}