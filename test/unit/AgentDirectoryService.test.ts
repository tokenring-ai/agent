import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import { YAML } from "bun";
import AgentDirectoryService from "../../AgentDirectoryService.ts";
import { AgentPackageConfigSchema } from "../../schema.ts";
import AgentManager from "../../services/AgentManager.ts";

describe("AgentDirectoryService", () => {
  const tempDirs: string[] = [];

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tr-agent-dir-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeService(agentDirectory: string): { service: AgentDirectoryService; agentManager: AgentManager } {
    const app = createTestingApp();
    const agentManager = app.addService(AgentManager, new AgentManager(app));
    const service = new AgentDirectoryService(app);
    void service.reconfigure(AgentPackageConfigSchema.parse({ agentDirectory }));
    return { service, agentManager };
  }

  const sampleAgent = {
    displayName: "Code Reviewer",
    description: "Reviews diffs for correctness bugs",
    category: "Coding",
    chat: {
      systemPrompt: "You review code.",
      enabledTools: ["file_*"],
    },
  };

  test("listAgentDefinitions returns an empty array when the directory doesn't exist", async () => {
    const { service } = makeService(path.join(tempDir(), "missing"));
    expect(await service.listAgentDefinitions()).toEqual([]);
  });

  test("createAgentDefinition writes a YAML file named after the agent type", async () => {
    const dir = tempDir();
    const { service } = makeService(dir);

    const created = await service.createAgentDefinition("code-reviewer", sampleAgent);
    expect(created).toMatchObject({ name: "code-reviewer", displayName: "Code Reviewer", category: "Coding" });
    // Defaults from AgentConfigSchema are filled in on write.
    expect(created.defaultCommand).toBe("/chat send");

    const filePath = path.join(dir, "code-reviewer.yaml");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(YAML.parse(fs.readFileSync(filePath, "utf-8"))).toMatchObject({ displayName: "Code Reviewer" });
  });

  test("plugin config slices survive the round trip through disk", async () => {
    const dir = tempDir();
    const { service } = makeService(dir);

    await service.createAgentDefinition("code-reviewer", sampleAgent);
    const read = await service.getAgentDefinition("code-reviewer");

    expect((read as Record<string, unknown>).chat).toEqual({ systemPrompt: "You review code.", enabledTools: ["file_*"] });
  });

  test("createAgentDefinition throws when the agent already exists", async () => {
    const { service } = makeService(tempDir());
    await service.createAgentDefinition("code-reviewer", sampleAgent);
    await expect(service.createAgentDefinition("code-reviewer", sampleAgent)).rejects.toThrow('Agent "code-reviewer" already exists');
  });

  test("updateAgentDefinition throws when the agent does not exist", async () => {
    const { service } = makeService(tempDir());
    await expect(service.updateAgentDefinition("nope", sampleAgent)).rejects.toThrow('Agent "nope" not found');
  });

  test("updateAgentDefinition overwrites the file", async () => {
    const { service } = makeService(tempDir());
    await service.createAgentDefinition("code-reviewer", sampleAgent);

    const updated = await service.updateAgentDefinition("code-reviewer", { ...sampleAgent, displayName: "Reviewer II" });
    expect(updated.displayName).toBe("Reviewer II");
    expect((await service.getAgentDefinition("code-reviewer"))?.displayName).toBe("Reviewer II");
  });

  test("deleteAgentDefinition removes the file and reports whether it existed", async () => {
    const dir = tempDir();
    const { service } = makeService(dir);
    await service.createAgentDefinition("code-reviewer", sampleAgent);

    expect(await service.deleteAgentDefinition("code-reviewer")).toBe(true);
    expect(fs.existsSync(path.join(dir, "code-reviewer.yaml"))).toBe(false);
    expect(await service.deleteAgentDefinition("code-reviewer")).toBe(false);
  });

  test("invalid agent names are rejected before touching the filesystem", async () => {
    const { service } = makeService(tempDir());
    await expect(service.createAgentDefinition("../escape", sampleAgent)).rejects.toThrow('Invalid agent name "../escape"');
  });

  test("an unparseable file is skipped without hiding its siblings", async () => {
    const dir = tempDir();
    const { service } = makeService(dir);
    await service.createAgentDefinition("good", sampleAgent);
    // Valid YAML, but missing the required displayName/description/category.
    fs.writeFileSync(path.join(dir, "bad.yaml"), "displayName: only a name\n");

    const definitions = await service.listAgentDefinitions();
    expect(definitions.map(definition => definition.name)).toEqual(["good"]);
  });

  test("non-yaml files are ignored", async () => {
    const dir = tempDir();
    const { service } = makeService(dir);
    await service.createAgentDefinition("good", sampleAgent);
    fs.writeFileSync(path.join(dir, "README.md"), "not an agent");

    expect((await service.listAgentDefinitions()).map(definition => definition.name)).toEqual(["good"]);
  });

  test("syncToManager registers directory agents as workspace agent types", async () => {
    const { service, agentManager } = makeService(tempDir());
    await service.createAgentDefinition("code-reviewer", sampleAgent);

    expect(agentManager.getAgentSource("code-reviewer")).toBe("workspace");
    expect(agentManager.getAgentConfig("code-reviewer")).toMatchObject({ agentType: "code-reviewer", displayName: "Code Reviewer" });

    await service.deleteAgentDefinition("code-reviewer");
    expect(agentManager.getAgentSource("code-reviewer")).toBeUndefined();
  });

  test("installedFrom is carried into the registered config so the agent list can report it", async () => {
    const { service, agentManager } = makeService(tempDir());
    await service.createAgentDefinition("code-reviewer", {
      ...sampleAgent,
      installedFrom: {
        registry: "tokenring-ai/community",
        id: "coding/code-reviewer",
        version: "1.0.0",
        author: "TokenRing",
        installedAt: "2026-08-16T00:00:00.000Z",
      },
    });

    const config = agentManager.getAgentConfig("code-reviewer") as Record<string, unknown>;
    expect(config.installedFrom).toMatchObject({ registry: "tokenring-ai/community", id: "coding/code-reviewer" });
    // Bookkeeping fields stay out of the runnable config.
    expect(config.name).toBeUndefined();
    expect(config.updatedAt).toBeUndefined();
  });
});
