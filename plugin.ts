import {TokenRingPlugin} from "@tokenring-ai/app";
import {ChatService} from "@tokenring-ai/chat";
import {WebHostService} from "@tokenring-ai/web-host";
import JsonRpcResource from "@tokenring-ai/web-host/JsonRpcResource";
import {z} from "zod";
import chatCommands from "./chatCommands.ts";
import contextHandlers from "./contextHandlers.ts";
import {AgentPackageConfigSchema} from "./index.ts";
import packageJSON from "./package.json" with {type: "json"};
import agentRPC from "./rpc/agent.ts";
import AgentCommandService from "./services/AgentCommandService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import AgentManager from "./services/AgentManager.js";
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
      chatService.addTools(packageJSON.name, tools);
      chatService.registerContextHandlers(contextHandlers);
    });

    const agentCommandService = new AgentCommandService();
    agentCommandService.addAgentCommands(chatCommands);
    app.addServices(agentCommandService);

    const agentManager = new AgentManager(app);
    if (config.agents) {
      agentManager.addAgentConfigs(config.agents);
    }
    app.addServices(agentManager);

    app.addServices(new AgentLifecycleService());

    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource("Agent RPC endpoint", new JsonRpcResource(app, agentRPC));
    });
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
