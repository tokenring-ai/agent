import {TokenRingPlugin} from "@tokenring-ai/app";
import {ChatService} from "@tokenring-ai/chat";
import {RpcService} from "@tokenring-ai/rpc";
import {z} from "zod";
import agentCommands from "./commands.ts";
import contextHandlers from "./contextHandlers.ts";
import packageJSON from "./package.json" with {type: "json"};
import agentRPC from "./rpc/agent.ts";
import {AgentPackageConfigSchema} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.ts";
import AgentManager from "./services/AgentManager.ts";
import SubAgentService from "./services/SubAgentService.ts";
import tools from "./tools.ts";

export default {
  name: packageJSON.name,
  displayName: "Agent Core",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(ChatService, chatService => {
      chatService.addTools(tools);
      chatService.registerContextHandlers(contextHandlers);
    });

    const agentCommandService = new AgentCommandService(app);
    agentCommandService.addAgentCommands(agentCommands);
    app.addServices(agentCommandService);

    const agentManager = new AgentManager(app);
    agentManager.addAgentConfigs(
      ...Object.entries(config.agents).map(
        ([agentType, agentConfig]) => ({agentType, ...agentConfig})
      )
    );
    app.addServices(agentManager);

    app.addServices(new SubAgentService(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(agentRPC);
    });
  },
  config: AgentPackageConfigSchema
} satisfies TokenRingPlugin<typeof AgentPackageConfigSchema>;
