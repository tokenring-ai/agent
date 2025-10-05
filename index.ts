import { z } from "zod";
import { AgentConfigSchema } from "./Agent.js";
import AgentContextService from "./AgentContextService.js";
import type AgentTeam from "./AgentTeam.ts";
import * as chatCommands from "./chatCommands.ts";
import packageJSON from "./package.json" with { type: "json" };
import * as tools from "./tools.ts";
import type { TokenRingPackage } from "./types.js";

export const AgentPackageConfigSchema = z
	.record(z.string(), AgentConfigSchema)
	.optional();

export const packageInfo: TokenRingPackage = {
	name: packageJSON.name,
	version: packageJSON.version,
	description: packageJSON.description,
	install(agentTeam: AgentTeam) {
		agentTeam.addTools(packageInfo, tools);
		agentTeam.addChatCommands(chatCommands);
		agentTeam.addServices(new AgentContextService());

		const agentsConfig = agentTeam.getConfigSlice(
			"agents",
			AgentPackageConfigSchema,
		);
		if (agentsConfig) {
			for (const name in agentsConfig) {
				agentTeam.addAgentConfig(name, agentsConfig[name]);
			}
		}
	},
};

export { default as Agent } from "./Agent.ts";
export { default as AgentTeam } from "./AgentTeam.ts";
export { type TokenRingPackage } from "./types.js";
