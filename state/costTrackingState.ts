import {z} from "zod";
import type {ResetWhat} from "../AgentEvents.ts";
import type {AgentStateSlice} from "../types.ts";

type Costs = Record<string, number>;

const serializationSchema = z.object({
  costs: z.record(z.string(), z.number()).default({})
}).prefault({});

export class CostTrackingState implements AgentStateSlice<typeof serializationSchema> {
  name = "CostTrackingState";
  serializationSchema = serializationSchema;
  costs: Costs;

  constructor(readonly initialCosts: Costs = {}) {
    this.costs = initialCosts;
  }

  reset(what: ResetWhat[]): void {
    if (what.includes("costs")) {
      this.costs = {};
    }
  }

  serialize(): z.output<typeof serializationSchema> {
    return { costs: this.costs };
  }

  deserialize(data: z.output<typeof serializationSchema>): void {
    this.costs = data.costs;
  }

  show(): string[] {
    const totalCost = Object.values(this.costs).reduce((a, b) => a + b, 0);

    return [
      `Overall Costs: \$${totalCost.toLocaleString(undefined, {minimumFractionDigits: 4})}`,
      ...Object.entries(this.costs).map(([key, value]) =>
        `- ${key} Cost: \$${value.toLocaleString(undefined, {minimumFractionDigits: 4})}`
      ),
    ]
  }
}
