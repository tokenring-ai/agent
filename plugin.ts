import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { RpcService } from "@tokenring-ai/rpc";
import agentCommands from "./commands.ts";
import packageJSON from "./package.json" with { type: "json" };
import agentRPC from "./rpc/agent.ts";
import { AgentPackageConfigSchema } from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.ts";
import AgentManager from "./services/AgentManager.ts";
import SubAgentService from "./services/SubAgentService.ts";
import tools from "./tools.ts";
import { createAgentCommand } from "./util/createAgentCommand.ts";

export default {
  name: packageJSON.name,
  displayName: "Agent Core",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(ChatService, chatService => {
      chatService.addTools(...tools);
    });

    const agentCommandService = new AgentCommandService(app);
    agentCommandService.addAgentCommands(agentCommands);
    app.addServices(agentCommandService);

    const agentManager = new AgentManager(app);
    const agentConfigs = Object.entries(config.agents).map(([agentType, agentConfig]) => ({ agentType, ...agentConfig }));
    agentManager.addAgentConfigs(...agentConfigs);

    app.addServices(agentManager);

    app.addServices(new SubAgentService(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(agentRPC);
    });

    for (const [name, commandConfig] of Object.entries(config.commands)) {
      const agentType = commandConfig.agentType;
      if (!agentManager.getAgentConfig(agentType)) {
        throw new Error(`Error while processing command ${name}: Agent ${agentType} not found`);
      }
      agentCommandService.addAgentCommands(createAgentCommand(name, commandConfig));
    }
  },
  config: AgentPackageConfigSchema,
} satisfies TokenRingPlugin<typeof AgentPackageConfigSchema>;
