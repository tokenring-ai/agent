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

export default {
  name: packageJSON.name,
  displayName: "Agent Core",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    app.waitForService(ChatService, chatService => {
      chatService.addTools(...tools);
    });

    const agentCommandService = new AgentCommandService(app);
    agentCommandService.addAgentCommands(agentCommands);
    app.addServices(agentCommandService);

    app.addServices(new AgentManager(app));
    app.addServices(new SubAgentService(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(agentRPC);
    });
  },
  reconfigure(app, config) {
    const agentManager = app.requireService(AgentManager);
    agentManager.reconfigure(config.agents);

    app.requireService(AgentCommandService).reconfigure(config.commands, agentManager);
  },
  configSchema: AgentPackageConfigSchema,
} satisfies TokenRingPlugin<typeof AgentPackageConfigSchema>;
