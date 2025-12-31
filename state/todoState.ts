import {z} from "zod";
import Agent from "../Agent.ts";
import {AgentStateSlice} from "../types.ts";


export const TodoStatusSchema = z.enum(["pending", "in_progress", "completed"]);

export type TodoStatus = z.infer<typeof TodoStatusSchema>;
export const TodoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: TodoStatusSchema,
});

export type TodoItem = z.infer<typeof TodoItemSchema>;

export class TodoState implements AgentStateSlice {
  name = "TodoState";
  readonly todos: TodoItem[] = [];

  constructor({}) {}

  transferStateFromParent(agent: Agent) {
    /* TODO: The todo list is shared with the parent agent by sharing a reference to the same array
     * This is extremely fragile and should be revisited. We set it to readonly to try and prevent
     * the array from being replaced
     */
    (this.todos as any) = agent.getState(TodoState).todos;
  }

  reset(_what: string[]): void {
    // Don't reset on general reset
  }

  serialize(): object {
    return {
      todos: this.todos,
    };
  }

  deserialize(data: any): void {
    this.todos.splice(0, this.todos.length, ...data.todos || []);
  }

  show(): string[] {
    const pending = this.todos.filter(t => t.status === "pending").length;
    const inProgress = this.todos.filter(t => t.status === "in_progress").length;
    const completed = this.todos.filter(t => t.status === "completed").length;
    return [
      `Total: ${this.todos.length}`,
      `Pending: ${pending}`,
      `In Progress: ${inProgress}`,
      `Completed: ${completed}`,
    ];
  }
}
