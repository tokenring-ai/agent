import markdownList from "@tokenring-ai/utility/string/markdownList";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "../types.ts";

const description = "Show current chat settings." as const;
const inputSchema = {} as const satisfies AgentCommandInputSchema;

export function execute({
                          agent,
                        }: AgentCommandInputType<typeof inputSchema>): string {
  const activeServiceNames = agent.app.getServices().map(s => s.name);

  return `
# Current settings:
## Active services: 
${activeServiceNames.length > 0 ? markdownList(activeServiceNames) : "[No services active]"}

## Agent State:
${
    Array.from(agent.stateManager.slices())
      .map(slice => `***${slice.name}***:\n${slice.show()}\n`)
  }`;

}

const help: string = `Displays current agent settings and configuration state.

## Output includes
- Active services currently running
- State information from all state managers
- Configuration details and settings

## Usage
/settings

## Example output
Current settings:
Active services: AgentCommandService, LifecycleService

State:
ChatHistory:
  Messages: 42
  Current session: active
AgentConfig:
  Model: gpt-4
  Temperature: 0.7`;

export default {
  name: "settings",
  description,
  inputSchema,
  execute,
  help,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
