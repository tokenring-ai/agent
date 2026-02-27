import Agent from "../../Agent.ts";
import get from "./get.ts";
import select from "./select.ts";

export default async function defaultAction(_remainder: string, agent: Agent): Promise<string> {
  if (agent.headless) {
    return await get("", agent);
  } else {
    return await select("", agent);
  }
}
