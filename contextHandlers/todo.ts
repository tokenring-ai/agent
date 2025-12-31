import Agent from "../Agent.ts";
import {ChatConfig, ContextItem} from "@tokenring-ai/chat/schema";
import {TodoState} from "../state/todoState.js";
import {formatTodoList} from "../tools/todo.ts";

export default async function * getTodoContext(
  input: string,
  chatConfig: ChatConfig,
  params: {},
  agent: Agent,
): AsyncGenerator<ContextItem> {
  const todoState = agent.getState(TodoState);

  const todoList = formatTodoList(todoState.todos);

  yield {
    role: "user",
    content:
      `/* Current todo list */\n` +
      `${todoList}`,
  };
}
