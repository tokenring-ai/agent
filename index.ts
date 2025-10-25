import {AIService} from "@tokenring-ai/ai-client";
import {z} from "zod";
import type AgentTeam from "./AgentTeam.ts";
import * as chatCommands from "./chatCommands.ts";
import packageJSON from "./package.json" with {type: "json"};
import AgentCommandService from "./services/AgentCommandService.js";
import AgentConfigService from "./services/AgentConfigService.js";
import AgentContextService from "./services/AgentContextService.js";
import AgentLifecycleService from "./services/AgentLifecycleService.js";
import * as tools from "./tools.ts";
import {AgentConfigSchema, TokenRingPackage} from "./types.js";

export const AgentPackageConfigSchema = z
  .record(z.string(), AgentConfigSchema)
  .optional();

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(agentTeam: AgentTeam) {
    agentTeam.waitForService(AIService, aiService =>
      aiService.addTools(packageJSON.name, tools)
    );

    const agentCommandService = new AgentCommandService();
    agentCommandService.addAgentCommands(chatCommands);
    agentTeam.addServices(agentCommandService);

    const agentConfigService = new AgentConfigService();
    const agentsConfig = agentTeam.getConfigSlice(
      "agents",
      AgentPackageConfigSchema,
    );
    if (agentsConfig) {
      agentConfigService.addAgentConfigs(agentsConfig);
    }
    agentTeam.addServices(agentConfigService);

    agentTeam.addServices(new AgentContextService(), new AgentLifecycleService());
  },
} as TokenRingPackage;

export {default as Agent} from "./Agent.ts";
export {default as AgentTeam} from "./AgentTeam.ts";
export {type TokenRingPackage} from "./types.js";

export {default as AgentConfigService} from './services/AgentConfigService.js';
export {default as AgentLifecycleService} from "./services/AgentLifecycleService.js";
export {default as AgentContextService} from "./services/AgentContextService.js";
export {default as AgentCommandService} from "./services/AgentCommandService.js";
export {default as AgentPackageManager} from "./services/AgentPackageManager.js";
