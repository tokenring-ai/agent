import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "../../types.ts";

const inputSchema = {
  args: {
    confirm: { type: "flag", description: "Shut down without asking first" },
  },
} as const satisfies AgentCommandInputSchema;

async function execute({ agent, args }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  // It stops every agent and the server; a mistyped command shouldn't do that unasked.
  if (!args.confirm) {
    // Unanswered (or nobody to ask) counts as no.
    const approved = await agent.askForApproval({ message: "Shut down the whole TokenRing app? Every agent stops and the server exits." });
    if (!approved) return "App shutdown cancelled. Run /debug app shutdown --confirm to shut down without asking.";
  }
  setTimeout(() => agent.app.shutdown());
  return "Sending app shutdown command...";
}

export default {
  name: "debug app shutdown",
  description: "Shut down the app (asks first unless --confirm is given)",
  inputSchema,
  execute,
  help: "Shuts down the whole app, to test the shutdown handling. Asks for confirmation first unless --confirm is given.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;
