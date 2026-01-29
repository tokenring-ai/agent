import Agent from "../../Agent.ts";
import get from "./get.ts";
import select from "./select.ts";

export default async function defaultAction(_remainder: string, agent: Agent): Promise<void> {
  if (agent.headless) {
    await get("", agent);
  } else {
    await select("", agent);
  }
}
