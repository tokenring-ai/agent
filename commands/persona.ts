import {Registry} from "@token-ring/registry";
import ChatService from "../ChatService.ts";
import HumanInterfaceService from "../HumanInterfaceService.ts";

export const description =
  "/persona [persona_name] - Set or show the target persona for chat" as const;

export async function execute(
  remainder: string | undefined,
  registry: Registry,
): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const humanInterfaceService = registry.getFirstServiceByType(
    HumanInterfaceService,
  );
  const personas = chatService.getPersonas() as Record<string, any>;
  const currentPersona = chatService.getPersona();

  // Handle direct persona name input, e.g. /persona assistant
  const directPersonaName = remainder?.trim();
  if (directPersonaName) {
    // If the persona doesn't exist, show an error
    if (!personas[directPersonaName]) {
      chatService.errorLine(
        `Persona "${directPersonaName}" does not exist. Available personas: ${Object.keys(personas).join(", ")}`,
      );
      return;
    }

    // Set the persona
    try {
      chatService.setPersona(directPersonaName);
      chatService.systemLine(`Switched to persona: ${directPersonaName}`);

      // Show the current settings for this persona
      const persona = personas[directPersonaName];
      chatService.systemLine(`Model: ${persona.model || "default"}`);
      chatService.systemLine(
        `Temperature: ${persona.temperature || "default"}`,
      );
      chatService.systemLine(`Top_p: ${persona.top_p || "default"}`);

      // Show a preview of the instructions (first 100 characters)
      if (persona.instructions) {
        const preview =
          persona.instructions.length > 100
            ? `${persona.instructions.substring(0, 100)}...`
            : persona.instructions;
        chatService.systemLine(`Instructions: ${preview}`);
      }
    } catch (error: any) {
      chatService.errorLine(`Error setting persona: ${error.message}`);
    }
    return;
  }

  // If no remainder provided, show interactive tree selection using askForTreeSelection
  const personaNames = Object.keys(personas).sort();

  try {
    if (!humanInterfaceService) {
      chatService.errorLine("No HumanInterfaceService available for interactive persona selection.");
      return;
    }

    const selectedPersona = await humanInterfaceService.askForSingleTreeSelection({
      message: `Current persona: ${currentPersona ?? "none"}. Choose a new persona:`,
      tree: {
        name: "Personas",
        children: personaNames.map((name) => ({
          name,
          value: name,
        })),
      },
      allowCancel: true,
      initialSelection: currentPersona ? [currentPersona] : [],
    });

    if (selectedPersona) {
      chatService.setPersona(selectedPersona);
      chatService.systemLine(`Switched to persona: ${selectedPersona}`);

      // Show the current settings for this persona
      const persona = personas[selectedPersona];
      chatService.systemLine(`Model: ${persona.model || "default"}`);
      chatService.systemLine(
        `Temperature: ${persona.temperature || "default"}`,
      );
      chatService.systemLine(`Top_p: ${persona.top_p || "default"}`);

      // Show a preview of the instructions (first 100 characters)
      if (persona.instructions) {
        const preview =
          persona.instructions.length > 100
            ? `${persona.instructions.substring(0, 100)}...`
            : persona.instructions;
        chatService.systemLine(`Instructions: ${preview}`);
      }
    } else {
      chatService.systemLine("Persona selection cancelled. No changes made.");
    }

  } catch (error) {
    chatService.errorLine(`Error during persona selection:`, error);
  }
}

export function help(): string[] {
  return [
    "/persona [persona_name]",
    "  - With no arguments: Shows interactive persona selection",
    "  - With persona_name: Switches to the specified persona",
  ];
}
