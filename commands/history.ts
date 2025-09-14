import Agent from "../Agent.ts";
import {AgentCheckpointListItem, StoredAgentCheckpoint} from "../AgentCheckpointProvider.js";
import AgentCheckpointService from "../AgentCheckpointService.js";

export const description: string = "/history - Browse agent checkpoints";

export async function execute(
  _remainder: string | undefined,
  agent: Agent,
): Promise<void> {
  const checkpointStorage = agent.requireFirstServiceByType(AgentCheckpointService);

    // Get all agent checkpoints
    const checkpoints = await checkpointStorage.listCheckpoints();

    if (!checkpoints || checkpoints.length === 0) {
      agent.infoLine("No checkpoint history found.");
      return;
    }

    // Group checkpoints by agentId (equivalent to sessions)
    const checkpointsByAgent = groupCheckpointsByAgent(checkpoints);

    // Build tree structure for checkpoint selection
    const buildHistoryTree = () => {
      const tree: any = {
        name: "Agent Checkpoint History",
        children: [],
      };

      const sortedAgentIds = Object.keys(checkpointsByAgent).sort();

      for (const agentId of sortedAgentIds) {
        const agentCheckpoints = checkpointsByAgent[agentId];
        const children = agentCheckpoints.map((checkpoint) => ({
          name: `📋 ${checkpoint.name} (${formatTime(checkpoint.createdAt)})`,
          value: checkpoint.id,
          checkpoint: checkpoint,
        }));

        tree.children.push({
          name: `🤖 Agent: ${agentId} (${agentCheckpoints.length} checkpoints)`,
          hasChildren: true,
          children,
        });
      }

      return tree;
    };

    // Show interactive tree selection
    const selectedCheckpointId = await agent.askHuman({
      type: "askForSingleTreeSelection",
      message: "Select checkpoint to view:",
      tree: buildHistoryTree()
    });

    if (selectedCheckpointId) {
      const selectedCheckpoint = checkpoints.find(({id}) => id === selectedCheckpointId);
      if (!selectedCheckpoint) {
        agent.errorLine(`Checkpoint ${selectedCheckpointId} could not be retrieved.`);
        return;
      }

      await displayCheckpointDetails(
        selectedCheckpoint,
        checkpointStorage,
        agent,
      );
    } else {
      agent.infoLine("Checkpoint browsing cancelled.");
    }
}

// Group checkpoints by agentId (equivalent to sessions)
function groupCheckpointsByAgent(
  checkpoints: AgentCheckpointListItem[],
): Record<string, typeof checkpoints> {
  const grouped: Record<string, typeof checkpoints> = {};

  for (const checkpoint of checkpoints) {
    const agentId = checkpoint.agentId;
    if (!grouped[agentId]) {
      grouped[agentId] = [];
    }
    grouped[agentId].push(checkpoint);
  }

  // Sort checkpoints within each agent group by creation time (newest first)
  for (const agentId in grouped) {
    grouped[agentId].sort((a, b) => b.createdAt - a.createdAt);
  }

  return grouped;
}

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateString === today.toISOString().split("T")[0]) {
    return "Today";
  } else if (dateString === yesterday.toISOString().split("T")[0]) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}

// Format time for display
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Display checkpoint details
async function displayCheckpointDetails(
  checkpointItem: AgentCheckpointListItem,
  checkpointStorage: AgentCheckpointService,
  agent: Agent,
): Promise<void> {
  agent.infoLine(
    `\n=== Checkpoint: ${checkpointItem.name} ===`,
  );
  agent.infoLine(
    `ID: ${checkpointItem.id}`,
  );
  agent.infoLine(
    `Agent ID: ${checkpointItem.agentId}`,
  );
  agent.infoLine(
    `Created: ${new Date(checkpointItem.createdAt).toLocaleString()}`,
  );

  try {
    // Retrieve the full checkpoint with state data (but don't restore it to current agent)
    const fullCheckpoint = await checkpointStorage.provider.retrieveCheckpoint(checkpointItem.id);
    
    if (fullCheckpoint) {
      agent.infoLine(`\n📋 Checkpoint State:`);
      agent.infoLine(`- Tools Enabled: ${fullCheckpoint.state.toolsEnabled.join(', ') || 'None'}`);
      agent.infoLine(`- Hooks Enabled: ${fullCheckpoint.state.hooksEnabled.join(', ') || 'None'}`);
      agent.infoLine(`- Agent State Keys: ${Object.keys(fullCheckpoint.state.agentState).join(', ') || 'None'}`);
    }

    agent.infoLine(`\n--- End of Checkpoint Details ---\n`);
  } catch (error) {
    agent.errorLine(
      `Error loading checkpoint ${checkpointItem.id}:`,
      error as Error,
    );
    
    // Show basic info even if retrieval fails
    agent.infoLine(`\n📋 Checkpoint Information:`);
    agent.infoLine(`- Name: ${checkpointItem.name}`);
    agent.infoLine(`- Agent ID: ${checkpointItem.agentId}`);
    agent.infoLine(`- Created: ${new Date(checkpointItem.createdAt).toLocaleString()}`);
    agent.infoLine(`\n--- End of Checkpoint Details ---\n`);
  }
}

// noinspection JSUnusedGlobalSymbols
export function help(): string[] {
  return [
    "/history",
    "  - With no arguments: Browse agent checkpoints using interactive tree selection grouped by agent ID",
  ];
}
