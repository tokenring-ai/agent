import {TokenRingService} from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import Agent from "../Agent.js";
import {HooksState} from "../state/hooksState.js";
import type {HookConfig, HookType} from "../types.js";

export default class AgentLifecycleService implements TokenRingService {
  readonly name = "AgentLifecycleService";
  description = "A service which dispatches hooks when certain agent lifecycle event happen.";

  private hooks = new KeyedRegistry<HookConfig>();

  registerHook = this.hooks.register;
  getAllHookEntries = this.hooks.entries;
  getAllHookNames = this.hooks.getAllItemNames;

  attach(agent: Agent): void {
    agent.initializeState(HooksState, agent.config);
  }

  addHooks(pkgName: string, hooks: Record<string, HookConfig>) {
    for (const hookName in hooks) {
      this.hooks.register(`${pkgName}/${hookName}`, hooks[hookName]);
    }
  }

  getEnabledHooks(agent: Agent): string[] {
    return agent.getState(HooksState).enabledHooks;
  }

  setEnabledHooks(hookNames: string[], agent: Agent): void {
    this.hooks.ensureItems(hookNames);

    agent.mutateState(HooksState, (state) => {
      state.enabledHooks = hookNames;
    })
  }

  enableHooks(hookNames: string[], agent: Agent): void {
    this.hooks.ensureItems(hookNames);

    agent.mutateState(HooksState, (state) => {
      for (const hook of hookNames) {
        if (!state.enabledHooks.includes(hook)) {
          state.enabledHooks.push(hook);
        }
      }
    })
  }

  disableHooks(hookNames: string[], agent: Agent): void {
    this.hooks.ensureItems(hookNames);
    agent.mutateState(HooksState, (state) => {
      state.enabledHooks = state.enabledHooks
        .filter((hook) =>
          !hookNames.includes(hook)
        )
    });
  }

  async executeHooks(agent: Agent, hookType: HookType, ...args: any[]): Promise<void> {
    for (const hookName of this.getEnabledHooks(agent)) {
      await this.hooks.requireItemByName(hookName)[hookType]?.(agent, ...args);
    }
  }
}
