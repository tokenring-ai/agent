import { DebugService, type TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
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
  install(app) {
    const agentCommandService = app.addService(new AgentCommandService());
    agentCommandService.addAgentCommands(agentCommands);

    app.addService(new AgentManager(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(agentRPC);
    });

    app.waitForService(DebugService, debugService => {
      debugService.registerSnapshotSource(createAgentSnapshotSource(app));
    });
  },
  reconfigure(app, config) {
    const agentManager = app.requireService(AgentManager);
    agentManager.reconfigure(config.agents);

    app.requireService(AgentCommandService).reconfigure(config.commands, agentManager);
  },
  configSchema: AgentPackageConfigSchema,
} satisfies TokenRingPlugin<typeof AgentPackageConfigSchema>;
