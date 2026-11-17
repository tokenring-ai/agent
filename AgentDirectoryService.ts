import fs from "node:fs/promises";
import path from "node:path";
import type TokenRingApp from "@tokenring-ai/app";
import writeYamlAtomic from "@tokenring-ai/app/config/writeYamlAtomic";
import type { TokenRingService } from "@tokenring-ai/app/types";
import formatError from "@tokenring-ai/utility/error/formatError";
import { YAML } from "bun";
import {
  type AgentDefinition,
  type AgentItemInput,
  AgentItemSchema,
  AgentPackageConfigSchema,
  type ParsedAgentConfig,
  type ParsedAgentPackageConfig,
} from "./schema.ts";
import AgentManager from "./services/AgentManager.ts";

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const EXTENSION = ".yaml";

const FILE_HEADER = "# TokenRing agent definition. The file name is the agent type.";

function assertValidName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid agent name "${name}". Names must start with a letter or number and may only contain letters, numbers, hyphens, and underscores.`);
  }
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * Manages editable agent types stored as YAML files on disk, and keeps them registered with
 * {@link AgentManager} as workspace agents.
 *
 * Layout: `<agentDirectory>/<agentType>.yaml`, one agent per file, the file body being the agent
 * config without its `agentType` (which comes from the file name).
 *
 * These sit alongside the bundled agent types that come from the configuration layers: bundled
 * agents are read-only and can only be cloned into this directory, agents in this directory can be
 * edited and deleted.
 */
export default class AgentDirectoryService implements TokenRingService {
  readonly name = "AgentDirectoryService";
  description = "Manages editable agent types, backed by YAML files on disk";

  private config = AgentPackageConfigSchema.parse({});
  /** Invalid agent files already reported, with the problem, so each is reported once. */
  private readonly invalidFiles = new Map<string, string>();
  private syncQueue: Promise<void> = Promise.resolve();

  constructor(private app: TokenRingApp) {}

  async reconfigure(newConfig: ParsedAgentPackageConfig): Promise<void> {
    const previousDirectory = this.config.agentDirectory;
    this.config = newConfig;
    // A directory change swaps the whole set of workspace agents. Awaited rather than backgrounded:
    // agent commands are reconciled straight after this and validate their agentType against the registry.
    if (previousDirectory !== newConfig.agentDirectory) {
      await this.syncToManager();
    }
  }

  getAgentDirectory(): string {
    return this.app.getWorkspaceResolvedPath(this.config.agentDirectory);
  }

  /**
   * Every valid agent definition in the agent directory, sorted by name. Files that fail to parse
   * are skipped so one bad file cannot hide the rest.
   */
  async listAgentDefinitions(): Promise<AgentDefinition[]> {
    const root = this.getAgentDirectory();
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch {
      return [];
    }

    const definitions: AgentDefinition[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue;
      const agentName = entry.slice(0, -EXTENSION.length);
      if (!NAME_PATTERN.test(agentName)) continue;
      try {
        const definition = await this.readAgentFile(path.join(root, entry), agentName);
        if (definition) definitions.push(definition);
      } catch (error) {
        this.reportInvalidFile(entry, error);
        continue;
      }
      this.invalidFiles.delete(entry);
    }

    return definitions.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAgentDefinition(agentName: string): Promise<AgentDefinition | null> {
    try {
      return await this.readAgentFile(this.resolveAgentPath(agentName), agentName);
    } catch (error) {
      throw new Error(`The agent file ${agentName}${EXTENSION} is not valid, so this agent type is not loaded: ${formatError(error)}`, { cause: error });
    }
  }

  /**
   * A file that fails to parse is left out, so its agent type disappears (or a bundled type of the
   * same name takes its place). Said where people look, once per distinct problem.
   */
  private reportInvalidFile(entry: string, error: unknown): void {
    const message = formatError(error);
    if (this.invalidFiles.get(entry) === message) return;
    this.invalidFiles.set(entry, message);
    this.app.serviceError(this, `Agent file ${entry} is not valid and was skipped, so its agent type is not available: ${message}`);
  }

  async createAgentDefinition(agentName: string, agent: AgentItemInput): Promise<AgentDefinition> {
    const filePath = this.resolveAgentPath(agentName);
    if (await pathExists(filePath)) {
      throw new Error(`Agent "${agentName}" already exists`);
    }
    const definition = await this.writeAgentFile(filePath, agentName, agent);
    await this.syncToManager();
    return definition;
  }

  async updateAgentDefinition(agentName: string, agent: AgentItemInput): Promise<AgentDefinition> {
    const filePath = this.resolveAgentPath(agentName);
    if (!(await pathExists(filePath))) {
      throw new Error(`Agent "${agentName}" not found`);
    }
    const definition = await this.writeAgentFile(filePath, agentName, agent);
    await this.syncToManager();
    return definition;
  }

  async deleteAgentDefinition(agentName: string): Promise<boolean> {
    const filePath = this.resolveAgentPath(agentName);
    try {
      await fs.unlink(filePath);
    } catch {
      return false;
    }
    await this.syncToManager();
    return true;
  }

  /**
   * Reads the whole directory and replaces the workspace agent types registered with
   * {@link AgentManager}. Safe to call before the manager exists — agents are picked up by the next
   * sync in that case.
   */
  async syncToManager(): Promise<void> {
    // One at a time: each sync replaces the whole set, so an older read finishing last would bring
    // back a type whose file was deleted in between.
    const run = this.syncQueue.then(() => this.syncOnce());
    this.syncQueue = run.catch(() => {});
    return run;
  }

  private async syncOnce(): Promise<void> {
    const agentManager = this.app.getService(AgentManager);
    if (!agentManager) return;

    const definitions = await this.listAgentDefinitions();
    const agents: Record<string, Omit<ParsedAgentConfig, "agentType">> = {};
    for (const definition of definitions) {
      agents[definition.name] = toAgentConfig(definition);
    }
    agentManager.setWorkspaceAgentConfigs(agents);
  }

  private resolveAgentPath(agentName: string): string {
    assertValidName(agentName);
    return path.join(this.getAgentDirectory(), `${agentName}${EXTENSION}`);
  }

  private async readAgentFile(filePath: string, agentName: string): Promise<AgentDefinition | null> {
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }

    const parsed = YAML.parse(await fs.readFile(filePath, "utf-8"));
    const item = AgentItemSchema.parse(parsed ?? {});
    return { ...item, name: agentName, updatedAt: stat.mtime.toISOString() };
  }

  private async writeAgentFile(filePath: string, agentName: string, agent: AgentItemInput): Promise<AgentDefinition> {
    const item = AgentItemSchema.parse(agent);
    writeYamlAtomic(filePath, item, FILE_HEADER);
    const stat = await fs.stat(filePath);
    return { ...item, name: agentName, updatedAt: stat.mtime.toISOString() };
  }
}

/**
 * Turns a stored definition into a runnable agent config by dropping the fields that describe the
 * file rather than the agent. `installedFrom` is kept: agent configs are loose, and carrying the
 * provenance through the registry is what lets the agent list report it without re-reading disk.
 */
function toAgentConfig(definition: AgentDefinition): Omit<ParsedAgentConfig, "agentType"> {
  const { name: _name, updatedAt: _updatedAt, ...config } = definition;
  return config as Omit<ParsedAgentConfig, "agentType">;
}
