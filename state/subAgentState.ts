import { z } from "zod";
import { AgentStateSlice } from "../types.ts";

const SubAgentEntrySchema = z.object({
  /** What the parent calls it, e.g. "explore-1". */
  name: z.string(),
  agentType: z.string(),
  displayName: z.string(),
  /** The agent it last ran as. A closed sub-agent is resumed from this agent's latest checkpoint. */
  agentId: z.string(),
  notify: z.boolean().default(true),
  createdAt: z.number(),
});

export type SubAgentEntry = z.output<typeof SubAgentEntrySchema>;

const serializationSchema = z
  .object({
    subAgents: z.array(SubAgentEntrySchema).default([]),
  })
  .prefault({});

/** Most sub-agents an agent remembers; the oldest are forgotten first. */
export const MAX_REMEMBERED_SUB_AGENTS = 50;

/**
 * The sub-agents an agent has started, by name. Saved with the agent, so after the agent is restored
 * (or the server restarts) it can still reach them: a closed one is resumed from its checkpoint.
 */
export class SubAgentState extends AgentStateSlice<typeof serializationSchema> {
  subAgents: SubAgentEntry[] = [];

  constructor() {
    super("SubAgentState", serializationSchema);
  }

  serialize(): z.output<typeof serializationSchema> {
    return { subAgents: this.subAgents.map(entry => ({ ...entry })) };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.subAgents = data.subAgents.map(entry => ({ ...entry }));
  }

  /** Adds or refreshes an entry, forgetting the oldest beyond the limit, except those named in `keep` (still running). */
  remember(entry: SubAgentEntry, keep: ReadonlySet<string> = new Set()): void {
    const next = [...this.subAgents.filter(existing => existing.name !== entry.name), entry];
    let excess = next.length - MAX_REMEMBERED_SUB_AGENTS;
    this.subAgents = next.filter(existing => {
      if (excess <= 0 || existing === entry || keep.has(existing.name)) return true;
      excess--;
      return false;
    });
  }

  show(): string {
    return this.subAgents.length === 0 ? "No sub-agents" : `Sub-agents: ${this.subAgents.map(entry => entry.name).join(", ")}`;
  }
}
