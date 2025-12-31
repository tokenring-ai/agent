import {ContextHandler} from "@tokenring-ai/chat/schema";
import availableAgents from "./contextHandlers/availableAgents.ts";
import todoContext from "./contextHandlers/todo.ts";

export default {
  'available-agents': availableAgents,
  'todo-list': todoContext,
} as Record<string, ContextHandler>;
