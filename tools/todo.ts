import {TokenRingToolDefinition, type TokenRingToolResult} from "@tokenring-ai/chat/schema";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import {z} from "zod";
import Agent from "../Agent.js";
import {TodoState} from "../state/todoState.js";
import {formatTodoList} from "../util/todo.ts";

const name = "todo";
const displayName = "Agent/todo";

/**
 * Creates and manages a structured task list for the current coding session.
 * This helps track progress, organize complex tasks, and demonstrate thoroughness to the user.
 */
export async function execute(
  {todos}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  // Get the current todo list from the agent's state
  const updatedTodos = agent.mutateState(TodoState, state => {
    // Update todos based on the input
    for (const todo of todos) {
      const existingIndex = state.todos.findIndex((t) => t.id === todo.id);
      if (existingIndex !== -1) {
        // Update existing todo
        state.todos[existingIndex] = todo;
      } else {
        // Add new todo
        state.todos.push(todo);
      }
    }
    return state.todos;
  });

  const renderedTodoList = markdownList(updatedTodos.map(todo => todo.status === 'completed'
    ? `[X] ${todo.content}`
    : `[ ] ${todo.content}${ todo.status === 'in_progress' ? ' (in_progress)' : ''}`
  ));

  agent.infoMessage(`Todo list updated! Current Todo list:\n ${renderedTodoList}`)

  const todoList = formatTodoList(updatedTodos);

  return `Todo list updated! Current Todo list:\n ${todoList}`;
}

const description =
  "The todo tool manages a list of items for the current task. This tool should proactively be used to organize complex tasks, track progress, and to convey the current task plan to the user.\n\n" +
  "Use this tool for:\n" +
  "- Non-trivial and complex tasks - Tasks that require careful planning or multiple operations\n" +
  "- Tasks with multiple concerns - Tasks that involve multiple areas of expertise or systems\n" +
  "- To capture and expand upon the most important requirements of the user and to complete the task\n" +
  " -So that you do not miss any critical execution details\n" +
  "Before you start working on a task, mark it as in_progress BEFORE beginning work\n" +
  "After completing a task, mark it as completed, and add any new follow-up tasks discovered during implementation\n\n" +
  "Skip using this tool when the users prompt is purely conversational, or the user has give a direct, straightforward, single concern, trivial task\n"

const inputSchema = z.object({
  todos: z
    .array(
      z
        .object({
          id: z.string().describe("Unique identifier for the task"),
          content: z
            .string()
            .min(1)
            .describe("The task description - what needs to be done"),
          status: z
            .enum(["pending", "in_progress", "completed"])
            .describe("Current status of the task"),
        }),
    )
    .describe("The updated todo list"),
});

const requiredContextHandlers: string[] = ['todo-list'];

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
  requiredContextHandlers
} satisfies TokenRingToolDefinition<typeof inputSchema>;
