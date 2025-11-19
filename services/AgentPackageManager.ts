import TypedRegistry from "@tokenring-ai/utility/TypedRegistry";
import type AgentTeam from "../AgentTeam.js";
import type {TokenRingPackage, TokenRingService} from "../types.js";

export default class AgentPackageManager implements TokenRingService {
  name = "AgentPackageManager";
  description = "Manages packages installed in the agent team";

  private packages = new TypedRegistry<TokenRingPackage>();

  getPackages = this.packages.getItems();

  async installPackages(packages: TokenRingPackage[], agentTeam: AgentTeam): Promise<void> {

    for (const pkg of packages) {
      this.packages.register(pkg);
      if (pkg.install) await pkg.install(agentTeam);
    }

    await Promise.all(
      this.packages.getItems().map(async pkg => {
        if (pkg.start) await pkg.start(agentTeam);
      })
    );
  }
}
