import {Agent} from "@tokenring-ai/agent";

export default async function execute(remainder: string, agent: Agent): Promise<void> {
  const arg = remainder.trim().toLowerCase();
  
  if (arg === "on") {
    agent.debugEnabled = true;
    agent.infoLine("Debug logging enabled");
  } else if (arg === "off") {
    agent.debugEnabled = false;
    agent.infoLine("Debug logging disabled");
  } else {
    agent.errorLine(`Invalid argument: ${arg}. Use 'on' or 'off'`);
  }
}
