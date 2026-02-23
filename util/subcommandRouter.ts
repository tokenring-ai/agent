import {Agent} from "@tokenring-ai/agent";
import pickValue from "@tokenring-ai/utility/object/pickValue";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import {CommandFailedError} from "../AgentError.ts";

export default function createSubcommandRouter(subcommands: Record<string, (remainder: string, agent: Agent) => Promise<string> | string>) {
  return async (remainder: string, agent: Agent) : Promise<string> => {
    const pos = remainder.indexOf(" ");
    const subCommand = remainder.substring(0, pos === -1 ? undefined : pos).toLowerCase();

    const subCmd = pickValue(subcommands,subCommand);

    if (subCmd) {
      return await subCmd(pos === -1 ? '' : remainder.substring(pos).trim(), agent);
    } else if (subcommands.default) {
      return await subcommands.default(remainder, agent);
    } else {
      throw new CommandFailedError(`
Unknown subcommand: ${subCommand || "(none)"}

Available subcommands:
${markdownList(Object.keys(subcommands).filter(k => k !== "default"))}
      `.trim());
    }
  };
}
