import type {HookSubscription} from "@tokenring-ai/lifecycle/types";
import {AfterAgentInputSuccess, HookCallback} from "@tokenring-ai/lifecycle/util/hooks";
import {TodoState} from "../state/todoState.js";
import Agent from "../Agent.js";

const name = "todoCompletionCheck";
const displayName = "Todo/Completion Check";
const description = "Checks if todos are complete at the end of a successful chat and prompts to complete remaining work";

const callbacks = [
  new HookCallback(AfterAgentInputSuccess, async (_data, agent) => {
    const todos = agent.getState(TodoState);
    
    if (!todos || !todos.todos || todos.todos.length === 0) {
      return;
    }

    // Check for incomplete todos
    const incompleteTodos = todos.todos.filter(
      todo => todo.status === "pending" || todo.status === "in_progress"
    );

    if (incompleteTodos.length === 0) {
      // All todos are complete
      //agent.infoMessage("✅ All todos completed!");
      return;
    }

    // There are incomplete todos - inform the agent
    const pendingCount = incompleteTodos.filter(t => t.status === "pending").length;
    const inProgressCount = incompleteTodos.filter(t => t.status === "in_progress").length;
    
    const message = `📋 **${incompleteTodos.length} remaining task(s)** detected:\n` +
      `${pendingCount} pending, ${inProgressCount} in progress\n\n` +
      "Please complete the remaining tasks on your todo list.\n\n" +
      formatIncompleteTodos(incompleteTodos);

    agent.handleInput({ from: "Todo Completion Check Hook", message });
  })
];

function formatIncompleteTodos(todos: Array<{id: string; content: string; status: string}>): string {
  return todos.map(todo => {
    const status = todo.status === "in_progress" ? "🔄" : "📝";
    return `- ${status} ${todo.id}: ${todo.content}`;
  }).join("\n");
}

export default {
  name,
  displayName,
  description,
  callbacks
} satisfies HookSubscription;
