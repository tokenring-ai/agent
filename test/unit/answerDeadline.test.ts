import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import type Agent from "../../Agent.ts";
import AgentManager from "../../services/AgentManager.ts";
import { AgentEventState } from "../../state/agentEventState.ts";
import createTestingAgent from "../createTestingAgent.test.ts";

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

/** An agent with one input running, as the command loop would have it, so it can ask questions. */
async function runningAgent(answerTimeoutSeconds?: number | null): Promise<Agent> {
  const agent = createTestingAgent(createTestingApp() as TokenRingApp);
  if (answerTimeoutSeconds !== undefined) agent.answerTimeoutSeconds = answerTimeoutSeconds;
  agent.handleInput({ from: "test", message: "work" });
  await waitFor(() => agent.getState(AgentEventState).inputQueue.length === 1);
  agent.mutateState(AgentEventState, state => {
    const item = state.inputQueue[0]!;
    item.executionState.status = "running";
    state.currentlyExecutingInputItem = item;
  });
  return agent;
}

const pending = (agent: Agent) => agent.getState(AgentEventState).currentlyExecutingInputItem?.executionState.availableInteractions ?? [];
const notes = (agent: Agent, type: "output.info" | "output.warning") =>
  agent
    .getState(AgentEventState)
    .events.filter(event => event.type === type)
    .map(event => (event as { message: string }).message);

describe("question deadlines", () => {
  it("deadline 0: takes the default at once without posting the question, and says so", async () => {
    const agent = await runningAgent(0);

    const text = await agent.askQuestion({ message: "Which branch?", question: { type: "text", label: "Branch", defaultValue: "main" } });
    expect(text).toBe("main");
    expect(await agent.askForText({ message: "Your name?", label: "Name" })).toBeNull();
    expect(await agent.askQuestion({ message: "Pick", question: { type: "treeSelect", label: "Pick", tree: [{ name: "A", value: "a" }] } })).toBeNull();
    expect(pending(agent)).toEqual([]);
    expect(notes(agent, "output.info").some(message => message.includes("Which branch?"))).toBe(true);
  });

  it("deadline 0 needs no running input (nothing is posted)", async () => {
    const agent = createTestingAgent(createTestingApp() as TokenRingApp);
    agent.answerTimeoutSeconds = 0;
    expect(await agent.askForApproval({ message: "Go?" })).toBe(false);
  });

  it("posts a question with its deadline, then times out to the default, withdraws it and leaves a note", async () => {
    const agent = await runningAgent(0.05);
    const before = Date.now();
    const answer = agent.askQuestion({ message: "Which branch?", question: { type: "text", label: "Branch", defaultValue: "main" } });

    await waitFor(() => pending(agent).length === 1);
    const posted = pending(agent)[0] as { autoSubmitAt?: number };
    expect(posted.autoSubmitAt).toBeGreaterThanOrEqual(before + 50);
    expect(posted.autoSubmitAt).toBeLessThanOrEqual(Date.now() + 50);

    expect(await answer).toBe("main");
    expect(pending(agent)).toEqual([]);
    expect(notes(agent, "output.warning").some(message => message.startsWith("No answer within") && message.includes("Which branch?"))).toBe(true);
  });

  it("an approval times out to refusal even when its default (the UI preselection) is yes", async () => {
    const agent = await runningAgent(0.03);
    expect(await agent.askForApproval({ message: "Delete the build folder?", defaultValue: true })).toBe(false);
    expect(notes(agent, "output.warning").some(message => message.includes("refused") && message.includes("Delete the build folder?"))).toBe(true);
  });

  it("a confirmation asked with whenUnanswered: true goes ahead when unanswered", async () => {
    const agent = await runningAgent(0.03);
    expect(await agent.askForApproval({ message: "Compact now?", whenUnanswered: true })).toBe(true);
    expect(await (await runningAgent(0)).askForApproval({ message: "Compact now?", whenUnanswered: true })).toBe(true);
  });

  it("an answer before the deadline wins", async () => {
    const agent = await runningAgent(5);
    const approval = agent.askForApproval({ message: "OK?" });
    await waitFor(() => pending(agent).length === 1);
    const item = agent.getState(AgentEventState).currentlyExecutingInputItem!;
    agent.sendInteractionResponse({ requestId: item.request.requestId, interactionId: pending(agent)[0]!.interactionId, result: ["Approved"] });
    expect(await approval).toBe(true);
    expect(notes(agent, "output.warning")).toEqual([]);
  });

  it("no deadline (null) waits until answered, with no countdown", async () => {
    const agent = await runningAgent(null);
    let settled = false;
    const approval = agent.askForApproval({ message: "OK?" }).then(result => {
      settled = true;
      return result;
    });
    await waitFor(() => pending(agent).length === 1);
    expect((pending(agent)[0] as { autoSubmitAt?: number }).autoSubmitAt).toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    const item = agent.getState(AgentEventState).currentlyExecutingInputItem!;
    agent.sendInteractionResponse({ requestId: item.request.requestId, interactionId: pending(agent)[0]!.interactionId, result: ["Approved"] });
    expect(await approval).toBe(true);
  });
});

describe("answer deadline inheritance", () => {
  it("a sub-agent follows its nearest parent's setting; its own setting wins; top-level defaults to waiting", () => {
    const parent = createTestingAgent(createTestingApp() as TokenRingApp);
    const agentManager = parent.app.requireService(AgentManager);
    agentManager.addAgentConfigs(parent.config);
    expect(parent.getAnswerTimeoutSeconds()).toBeNull();

    parent.answerTimeoutSeconds = 0;
    const child = agentManager.spawnSubAgent(parent, parent.config.agentType);
    const grandchild = agentManager.spawnSubAgent(child, parent.config.agentType);
    expect(child.getAnswerTimeoutSeconds()).toBe(0);
    expect(grandchild.getAnswerTimeoutSeconds()).toBe(0);

    child.answerTimeoutSeconds = 600;
    expect(grandchild.getAnswerTimeoutSeconds()).toBe(600);

    const pinned = agentManager.spawnSubAgent(parent, parent.config.agentType, {}, { answerTimeoutSeconds: null });
    expect(pinned.getAnswerTimeoutSeconds()).toBeNull();
  });

  it("spawnAgent takes the setting from whoever starts the agent", () => {
    const app = createTestingApp() as TokenRingApp;
    const starter = createTestingAgent(app);
    const agentManager = app.requireService(AgentManager);
    agentManager.addAgentConfigs(starter.config);
    expect(agentManager.spawnAgent({ agentType: starter.config.agentType, answerTimeoutSeconds: 0 }).getAnswerTimeoutSeconds()).toBe(0);
    expect(agentManager.spawnAgent({ agentType: starter.config.agentType }).getAnswerTimeoutSeconds()).toBeNull();
  });
});

describe("the retired headless flag", () => {
  /** Mentions that are about something else (a headless browser) or name the retired key on purpose. */
  const allowed = [
    /headless (browser|chrome|chromium|mode of the browser)/i,
    /chromium\.launch|puppeteer|playwright/i,
    /RETIRED_KEYS/,
    /a `headless` field sent by older/,
  ];
  const root = path.resolve(import.meta.dir, "../../../..");
  const skip = new Set(["node_modules", "dist", "build", ".docusaurus", "target", "schema"]);

  function* sources(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      if (skip.has(name) || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) yield* sources(full);
      else if (/\.(ts|tsx|rs)$/.test(name) && full !== import.meta.path) yield full;
    }
  }

  it("is gone from the code (agents, RPC, frontend, CLI)", () => {
    const offenders: string[] = [];
    for (const dir of ["plugin", "frontend/src", "backend", "cli/src"]) {
      for (const file of sources(path.join(root, dir))) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (/headless/i.test(line) && !allowed.some(pattern => pattern.test(line)))
              offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
