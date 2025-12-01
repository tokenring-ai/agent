import {ChatService} from "@tokenring-ai/chat";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {z} from "zod";
import TokenRingApp from "@tokenring-ai/app";
import chatCommands from "./chatCommands.ts";
import contextHandlers from "./contextHandlers.ts";
import packageJSON from "./package.json" with {type: "json"};
import AgentCommandService from "./services/AgentCommandService.js";
import AgentManager from "./services/AgentManager.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import tools from "./tools.ts";
import {AgentConfigSchema} from "./types.js";

export const AgentPackageConfigSchema = z
  .record(z.string(), AgentConfigSchema)
  .optional();

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    app.waitForService(ChatService, chatService => {
      chatService.addTools(packageJSON.name, tools);
      chatService.registerContextHandlers(contextHandlers);
    });

    const agentCommandService = new AgentCommandService();
    agentCommandService.addAgentCommands(chatCommands);
    app.addServices(agentCommandService);

    const agentManager = new AgentManager(app);
    const agentsConfig = app.getConfigSlice(
      "agents",
      AgentPackageConfigSchema,
    );
    if (agentsConfig) {
      agentManager.addAgentConfigs(agentsConfig);
    }
    app.addServices(agentManager);

    app.addServices(new AgentLifecycleService());
  },
} as TokenRingPlugin;

export {default as Agent} from "./Agent.ts";

export {default as AgentManager} from './services/AgentManager.js';
export {default as AgentLifecycleService} from "./services/AgentLifecycleService.js";
export {default as AgentCommandService} from "./services/AgentCommandService.js";
