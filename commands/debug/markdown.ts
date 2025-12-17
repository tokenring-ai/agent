import {Agent} from "@tokenring-ai/agent";

// @ts-ignore
import markdownSample from './markdown.sample.md' with {type: 'text'};

export default async function execute(remainder: string, agent: Agent): Promise<void> {
  agent.chatOutput(markdownSample);
}
