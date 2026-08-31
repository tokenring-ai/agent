import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import AgentDirectoryService from "../../AgentDirectoryService.ts";
import agentRpc from "../../rpc/agent.ts";
import { AgentConfigSchema, AgentPackageConfigSchema } from "../../schema.ts";
import AgentManager from "../../services/AgentManager.ts";

const bundledConfig = AgentConfigSchema.parse({
  agentType: "bundled-agent",
  displayName: "Bundled Agent",
  description: "Ships with the app",
  category: "Coding",
});

/** Invokes an RPC method the way the transport does, after its input schema has parsed the args. */
function call<T>(method: string, args: Record<string, unknown>, app: TokenRingApp): Promise<T> {
  const methods = agentRpc.methods as unknown as Record<string, { execute: (args: unknown, app: TokenRingApp) => unknown } | undefined>;
  const execute = methods[method]?.execute;
  if (!execute) throw new Error(`${method} is not registered`);
  return Promise.resolve(execute(args, app) as T);
}

describe("agent directory RPC", () => {
  const tempDirs: string[] = [];

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-agent-rpc-"));
    tempDirs.push(dir);
    return dir;
  }

  function makeApp() {
    const app = createTestingApp();
    const manager = app.addService(AgentManager, new AgentManager(app));
    manager.addAgentConfigs(bundledConfig);

    const agentDirectory = tempDir();
    const directoryService = app.addService(AgentDirectoryService, new AgentDirectoryService(app));
    void directoryService.reconfigure(AgentPackageConfigSchema.parse({ agentDirectory }));

    return { app, manager, agentDirectory };
  }

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  it("labels bundled and workspace agent types in getAgentTypes", async () => {
    const { app } = makeApp();
    await call("createAgentDefinition", { name: "authored", agent: { displayName: "Authored", description: "Mine", category: "Coding" } }, app);

    const types = (await call<{ type: string; source: string }[]>("getAgentTypes", {}, app)).sort((a, b) => a.type.localeCompare(b.type));
    expect(types.map(t => [t.type, t.source])).toEqual([
      ["authored", "workspace"],
      ["bundled-agent", "bundled"],
    ]);
  });

  it("returns the full body of a workspace agent, with its mtime", async () => {
    const { app } = makeApp();
    await call(
      "createAgentDefinition",
      { name: "authored", agent: { displayName: "Authored", description: "Mine", category: "Coding", chat: { enabledTools: ["file_*"] } } },
      app,
    );

    const detail = await call<{ status: string; source: string; agent: Record<string, unknown>; updatedAt: string | null }>(
      "getAgentTypeDetail",
      { type: "authored" },
      app,
    );
    expect(detail.status).toBe("success");
    expect(detail.source).toBe("workspace");
    expect(detail.agent.chat).toEqual({ enabledTools: ["file_*"] });
    expect(detail.updatedAt).toBeString();
  });

  it("returns a bundled agent's running config so it can be cloned", async () => {
    const { app } = makeApp();

    const detail = await call<{ status: string; source: string; agent: Record<string, unknown>; updatedAt: string | null }>(
      "getAgentTypeDetail",
      { type: "bundled-agent" },
      app,
    );
    expect(detail).toMatchObject({ status: "success", source: "bundled", updatedAt: null });
    expect(detail.agent).toMatchObject({ displayName: "Bundled Agent" });
    // The file-name-derived key is not part of the body.
    expect(detail.agent.agentType).toBeUndefined();
  });

  it("reports an unknown agent type rather than throwing", async () => {
    const { app } = makeApp();
    expect(await call<{ status: string }>("getAgentTypeDetail", { type: "nope" }, app)).toEqual({ status: "agentTypeNotFound" });
  });

  it("deletes a workspace agent definition and unregisters the type", async () => {
    const { app, manager } = makeApp();
    await call("createAgentDefinition", { name: "authored", agent: { displayName: "Authored", description: "Mine", category: "Coding" } }, app);

    expect(await call<{ success: boolean }>("deleteAgentDefinition", { name: "authored" }, app)).toEqual({ success: true });
    expect(manager.getAgentSource("authored")).toBeUndefined();
  });
});
