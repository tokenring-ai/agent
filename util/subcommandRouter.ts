import {Agent} from "@tokenring-ai/agent";
import pickValue from "@tokenring-ai/utility/object/pickValue";

export default function createSubcommandRouter(subcommands: Record<string, (remainder: string, agent: Agent) => Promise<void>>) {
  return async (remainder: string, agent: Agent) => {
    const pos = remainder.indexOf(" ");
    const subCommand = remainder.substring(0, pos === -1 ? undefined : pos).toLowerCase();

    const subCmd = pickValue(subcommands,subCommand);

    if (subCmd) {
      await subCmd(pos === -1 ? '' : remainder.substring(pos).trim(), agent);
    } else if (subcommands.default) {
      await subcommands.default(remainder, agent);
    } else {
      agent.errorLine(`Unknown subcommand: ${subCommand || "(none)"}`);
      agent.infoLine(`Available subcommands: ${Object.keys(subcommands).filter(k => k !== "default").join(", ")}`);
    }
  };
}
