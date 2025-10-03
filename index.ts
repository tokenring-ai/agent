import * as chatCommands from "./chatCommands.ts";
import packageJSON from "./package.json" with { type: "json" };
import * as tools from "./tools.ts";
import type { TokenRingPackage } from "./types.js";

export const packageInfo: TokenRingPackage = {
	name: packageJSON.name,
	version: packageJSON.version,
	description: packageJSON.description,
	chatCommands,
	tools,
};

export { default as Agent } from "./Agent.ts";
export { default as AgentTeam } from "./AgentTeam.ts";
export { default as AgentStateStorage } from "./AgentCheckpointService.ts";
export { type TokenRingPackage } from "./types.js";
