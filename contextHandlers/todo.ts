import {type ContextHandlerOptions, ContextItem} from "@tokenring-ai/chat/schema";
import {TodoState} from "../state/todoState.ts";

import {formatTodoList} from "../util/todo.ts";

export default async function* getTodoContext({agent}: ContextHandlerOptions): AsyncGenerator<ContextItem> {
  const todoState = agent.getState(TodoState);

  const todoList = formatTodoList(todoState.todos);

  yield {
    role: "user",
    content:
      `/* Current todo list */\n` +
      `${todoList}`,
  };
}
