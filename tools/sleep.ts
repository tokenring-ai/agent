import {TokenRingToolDefinition, type TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import Agent from "../Agent.ts";

const name = "sleep";
const displayName = "Agent/sleep";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function execute(
  { seconds }: z.output<typeof inputSchema>,
  agent: Agent
): Promise<TokenRingToolResult> {
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));

  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return `
Slept for ${seconds} seconds.
Current Date: ${now.toLocaleDateString("en-US")}
Current Time: ${now.toLocaleTimeString("en-US")}
Day of Week: ${DAYS[now.getDay()]}
Timezone: ${timezone}
  `;
}

const description = "Sleeps for a specified number of seconds, then returns the current date and time.\n" +
  "Useful for introducing delays in agent workflows or waiting before performing actions.";

const inputSchema = z.object({
  seconds: z
    .number()
    .int()
    .positive()
    .describe("The number of seconds to sleep (must be a positive integer)."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
