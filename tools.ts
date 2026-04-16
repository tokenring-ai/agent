import type {TokenRingToolDefinition} from "@tokenring-ai/chat";
import getCurrentDatetime from "./tools/getCurrentDatetime.ts";
import sleep from "./tools/sleep.ts";
import giveUp from "./tools/giveUp.ts";

export default [getCurrentDatetime, sleep, giveUp] satisfies TokenRingToolDefinition<any>[];
