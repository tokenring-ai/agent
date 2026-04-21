import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import type Agent from "../Agent.ts";

const name = "get_current_datetime";
const displayName = "Agent/Get Current Date & Time";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function execute(_args: z.output<typeof inputSchema>, _agent: Agent): TokenRingToolResult {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return `
Date: ${now.toLocaleDateString("en-US")} 
Time: ${now.toLocaleTimeString("en-US")} 
Day of Week: ${DAYS[now.getDay()]} 
Timezone: ${timezone}
  `;
}

const description =
  "Returns the current date, time, day of week, and the user's local timezone.\n" +
  "Use this tool any time you need to determine what date and time it is.\n" +
  "Do not rely on your internal knowledge of what date and time it is, " +
  "since that date and time is when you were ***trained***, and is not reflective of the current date and time";

const inputSchema = z.object({});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
