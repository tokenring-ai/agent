/**
 * /checkpoint create [label] - stores current previous_response_id as a checkpoint.
 * /checkpoint restore <id> - restores previous_response_id from checkpoint
 * /checkpoint list - shows all checkpoints
 */
import Agent from "../Agent.ts";
import AgentCheckpointService from "../AgentCheckpointService.ts";


export const description: string =
  "/checkpoint [create|restore|list] - Create or restore conversation checkpoints to resume chat.";

export async function execute(
  remainder: string | undefined,
  agent: Agent,
): Promise<void> {
  const checkpointService =
    agent.requireFirstServiceByType(AgentCheckpointService);

  const [action, ...args] = (remainder || "").trim().split(/\s+/);


  switch (action) {
    case "create": {
      const label = args.join(" ") || `New Checkpoint`;
      const checkpointId = await checkpointService.saveAgentCheckpoint(label, agent);

      agent.infoLine(`Checkpoint created: ${checkpointId}: ${label}`);

      break;
    }
    case "restore": {
      if (!args[0]) {
        agent.errorLine(
          "Usage: /checkpoint restore <id> (see /checkpoint list for ids)",
        );
        return;
      }

      await checkpointService.restoreAgentCheckpoint(args[0], agent);

      agent.infoLine(`Checkpoint ${args[0]} loaded`);

      break;
    }
    default: {
      const savedCheckpoints = await checkpointService.listCheckpoints();
      if (savedCheckpoints.length === 0) {
        agent.infoLine(
          "No checkpoints saved. Use /checkpoint create to make one.",
        );
        break;
      }

      // Group checkpoints by date (YYYY-MM-DD)
      const grouped: Record<string, typeof savedCheckpoints> = {};
      for (const cp of savedCheckpoints) {
        const date = new Date(cp.createdAt).toISOString().slice(0, 10);
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(cp);
      }

      // Construct tree for selection
      const tree = {
        name: "Checkpoint Selection",
        children: Object.keys(grouped)
          .sort((a, b) => b.localeCompare(a)) // Most recent first
          .map((date) => ({
            name: `📅 ${date} (${grouped[date].length} checkpoints)`,
            value: date,
            hasChildren: true,
            children: grouped[date]
              .sort((a, b) => b.createdAt - a.createdAt) // Most recent first within date
              .map((cp, _index) => ({
                name: `⏰ ${new Date(cp.createdAt).toLocaleTimeString()} - ${cp.name}`,
                value: cp.id,
              })),
          })),
      } as const;

      // Show interactive tree selection
      try {

        const selectedId = await agent.askHuman({
          type: "askForSingleTreeSelection",
          message: "Select a checkpoint to restore:",
          tree
        });

        if (!selectedId) {
          agent.infoLine(
            "Checkpoint selection cancelled. No changes made.",
          );
          return;
        }

        const row = await checkpointService.restoreAgentCheckpoint(selectedId, agent);

        agent.infoLine(`Checkpoint ${selectedId} loaded`);
      } catch (error) {
        agent.errorLine(`Error during checkpoint selection: ${error}`);
      }
      break;
    }
  }
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return [
    "/checkpoint [action] [args...] - Create or restore conversation checkpoints",
    "  Actions:",
    "    create [label]     - Create checkpoint with optional label",
    "    restore <id>       - Restore specific checkpoint by ID",
    "    list               - Interactive tree selection of checkpoints",
    "",
    "  Examples:",
    "    /checkpoint create           - Create checkpoint with default label",
    "    /checkpoint create 'My Fix'  - Create checkpoint with custom label",
    "    /checkpoint restore abc123   - Restore specific checkpoint",
    "    /checkpoint list             - Show interactive checkpoint browser",
  ];
}
