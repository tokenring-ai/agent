import {z} from "zod";
import {AgentConfigSchema} from "./types.js";

export const AgentPackageConfigSchema = z
  .record(z.string(), AgentConfigSchema)
  .optional();



export { default as Agent } from "./Agent.ts";

export { default as AgentManager } from './services/AgentManager.js';
export { default as AgentLifecycleService } from "./services/AgentLifecycleService.js";
export { default as AgentCommandService } from "./services/AgentCommandService.js";
export { default as SubcommandRouter} from "./util/subcommandRouter.ts"
