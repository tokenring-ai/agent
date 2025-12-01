import {ContextHandler} from "@tokenring-ai/chat/types";
import {default as availableAgents} from "./contextHandlers/availableAgents.ts";

export default {
  'available-agents': availableAgents,
} as Record<string, ContextHandler>;
