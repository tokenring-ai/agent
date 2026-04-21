import type { TokenRingToolDefinition } from "@tokenring-ai/chat";
import getCurrentDatetime from "./tools/getCurrentDatetime.ts";
import giveUp from "./tools/giveUp.ts";
import sleep from "./tools/sleep.ts";

export default [getCurrentDatetime, sleep, giveUp] satisfies TokenRingToolDefinition<any>[];
