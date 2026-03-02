import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "../../types.ts";

// @ts-ignore
import markdownSample from './markdown.sample.md' with {type: 'text'};

export default {
  name: "debug markdown",
  description: "/debug markdown - Output a markdown sample",
  execute: async (_remainder: string, _agent: Agent): Promise<string> => markdownSample,
  help: `
## /debug markdown

Output a markdown sample to test console rendering.
`,
} satisfies TokenRingAgentCommand;
