import { DebugService, type TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import AgentDirectoryService from "./AgentDirectoryService.ts";
import agentCommands from "./commands.ts";
import { createAgentSnapshotSource } from "./debug/agentSnapshotSource.ts";
import packageJSON from "./package.json" with { type: "json" };
import agentRPC from "./rpc/agent.ts";
import { AgentPackageConfigSchema } from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.ts";
import AgentManager from "./services/AgentManager.ts";

export default {
  name: packageJSON.name,
  displayName: "Agent Core",
  version: packageJSON.version,
  description: packageJSON.description,
  async install(app) {
    const agentCommandService = app.addService(AgentCommandService, new AgentCommandService());
    agentCommandService.addAgentCommands(agentCommands);

    app.addService(AgentManager, new AgentManager(app));
    const agentDirectoryService = app.addService(AgentDirectoryService, new AgentDirectoryService(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(agentRPC);
    });

    app.waitForService(DebugService, debugService => {
      debugService.registerSnapshotSource(createAgentSnapshotSource(app));
    });

    // Workspace agents have to be registered before the first reconfigure: agent commands validate
    // their agentType against the registry and a failure there rolls back the whole config apply.
    await agentDirectoryService.syncToManager();
  },
  async reconfigure(app, config) {
    const agentManager = app.requireService(AgentManager);
    agentManager.reconfigure(config.agents);

    await app.requireService(AgentDirectoryService).reconfigure(config);

    // Last: this validates every command's agentType against the registry both halves just filled in.
    app.requireService(AgentCommandService).reconfigure(config.commands, agentManager);
  },
  configSchema: AgentPackageConfigSchema,
} satisfies TokenRingPlugin<typeof AgentPackageConfigSchema>;
