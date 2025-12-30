import {ContextHandler} from "@tokenring-ai/chat/schema";
import availableAgents from "./contextHandlers/availableAgents.ts";

export default {
  'available-agents': availableAgents,
} as Record<string, ContextHandler>;
