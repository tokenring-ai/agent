import {ContextItem, ParsedChatConfig} from "@tokenring-ai/chat/schema";
import Agent from "../Agent.ts";
import {TodoState} from "../state/todoState.js";

import {formatTodoList} from "../util/todo.ts";

export default async function * getTodoContext(
  input: string,
  chatConfig: ParsedChatConfig,
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
