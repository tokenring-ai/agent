import type {TokenRingPlugin} from "@tokenring-ai/app";
import {ChatService, type TokenRingToolDefinition} from "@tokenring-ai/chat";
import {RpcService} from "@tokenring-ai/rpc";
import agentCommands from "./commands.ts";
import packageJSON from "./package.json" with {type: "json"};
import agentRPC from "./rpc/agent.ts";
import {AgentPackageConfigSchema} from "./schema.ts";
import AgentCommandService from "./services/AgentCommandService.ts";
import AgentManager from "./services/AgentManager.ts";
import SubAgentService from "./services/SubAgentService.ts";
import tools from "./tools.ts";
import type {TokenRingAgentCommand} from "./types.ts";
import {createAgentCommand} from "./util/createAgentCommand.ts";
import {createAgentTool} from "./util/createAgentTool.ts";

export default {
  name: packageJSON.name,
  displayName: "Agent Core",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(ChatService, (chatService) => {
      chatService.addTools(tools);
    });

    const agentCommandService = new AgentCommandService(app);
    agentCommandService.addAgentCommands(agentCommands);
    app.addServices(agentCommandService);

    const agentManager = new AgentManager(app);
    const agentConfigs = Object.entries(config.agents).map(
      ([agentType, agentConfig]) => ({agentType, ...agentConfig}),
    );
    agentManager.addAgentConfigs(...agentConfigs);

    app.addServices(agentManager);

    app.addServices(new SubAgentService(app));

    app.waitForService(RpcService, (rpcService) => {
      rpcService.registerEndpoint(agentRPC);
    });

    app.waitForService(AgentCommandService, (commandService) => {
      const commands: TokenRingAgentCommand[] = [];
      for (const config of agentConfigs) {
        for (const [name, commandConfig] of Object.entries(
          config.callable.commands,
        )) {
          commands.push(createAgentCommand(name, commandConfig, config));
        }
      }
      commandService.addAgentCommands(...commands);
    });

    app.waitForService(ChatService, (chatService) => {
      const tools: Record<string, TokenRingToolDefinition<any>> = {};
      for (const config of agentConfigs) {
        for (const [name, toolConfig] of Object.entries(
          config.callable.tools,
        )) {
          tools[name] = createAgentTool(name, toolConfig, config);
        }
      }
      chatService.addTools(tools);
    });
  },
  config: AgentPackageConfigSchema,
} satisfies TokenRingPlugin<typeof AgentPackageConfigSchema>;
