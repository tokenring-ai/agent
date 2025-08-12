import packageJSON from './package.json' with { type: 'json' };
export const name = packageJSON.name;
export const version = packageJSON.version;
export const description = packageJSON.description;

export { default as ChatService } from "./ChatService.ts";
export * as chatCommands from "./chatCommands.ts";
export { default as HumanInterfaceService } from "./HumanInterfaceService.ts";
