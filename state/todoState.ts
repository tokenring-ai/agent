import {z} from "zod";
import Agent from "../Agent.ts";
import {type ParsedAgentConfig, type TodoItem, TodoItemSchema} from "../schema.ts";
import {AgentStateSlice} from "../types.ts";

const serializationSchema = z.object({
  todos: z.array(TodoItemSchema).default([])
}).prefault({});

export class TodoState implements AgentStateSlice<typeof serializationSchema> {
  readonly name = "TodoState";
  serializationSchema = serializationSchema;
  todos: TodoItem[] = [];

  constructor(readonly initialConfig: ParsedAgentConfig) {
    if (initialConfig.todos.initialItems) {
      this.todos = [...initialConfig.todos.initialItems];
    }
  }

  transferStateFromParent(parentAgent: Agent) {
    if (parentAgent.config.todos.copyToChild) {
      const parentTodos = parentAgent.getState(TodoState).todos;
      this.todos = [...parentTodos];
    }
  }

  serialize(): z.output<typeof serializationSchema> {
    return {
      todos: this.todos,
    };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
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
