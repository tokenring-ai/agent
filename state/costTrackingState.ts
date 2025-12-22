import type {ResetWhat} from "../AgentEvents.ts";
import type {AgentStateSlice} from "../types.ts";

type Costs = Record<string, number>;

export class CostTrackingState implements AgentStateSlice {
  name = "CostTrackingState";
  costs: Costs;

  constructor(private initialCosts:Costs = {}) {
    this.costs = initialCosts;
  }

  reset(what: ResetWhat[]): void {
    if (what.includes("costs")) {
      this.costs = {};
    }
  }

  serialize(): object {
    return this.costs;
  }

  deserialize(data: any): void {
    this.costs = data
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
