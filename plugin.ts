import {TokenRingPlugin} from "@tokenring-ai/app";
import {ChatService} from "@tokenring-ai/chat";
import {AgentLifecycleService} from "@tokenring-ai/lifecycle";
import {RpcService} from "@tokenring-ai/rpc";
import {z} from "zod";
import agentCommands from "./commands.ts";
import contextHandlers from "./contextHandlers.ts";
import hooks from "./hooks.ts";
import packageJSON from "./package.json" with {type: "json"};
import agentRPC from "./rpc/agent.ts";
import {AgentPackageConfigSchema} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.ts";
import AgentManager from "./services/AgentManager.ts";
import SubAgentService from "./services/SubAgentService.ts";
import tools from "./tools.ts";

const packageConfigSchema = z.object({
  agents: AgentPackageConfigSchema
})


export default {
  name: packageJSON.name,
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
    if (config.agents.app) {
      agentManager.addAgentConfigs(...config.agents.app);
    }
    if (config.agents.user) {
      agentManager.addAgentConfigs(...config.agents.user);
    }
    app.addServices(agentManager);

    app.addServices(new SubAgentService(app));


    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(agentRPC);
    });

    // Register hooks with the lifecycle service
    app.waitForService(AgentLifecycleService, lifecycleService => {
      lifecycleService.addHooks(hooks);
    });
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
