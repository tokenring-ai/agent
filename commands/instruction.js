import ChatService from "../ChatService.js";


  export const description = "/instructions <instructions ....> - Set or view current instructions";

  export function execute(remainder, registry) {
    const chatService = registry.requireFirstServiceByType(ChatService);
    const instructions = chatService.getInstructions();

    if (remainder) {
      chatService.setInstructions(remainder.trim());
      chatService.systemLine("Instructions set!");
      return;
    }

    chatService.systemLine(`Current Instructions: ${instructions}`);
  }

export function help() {
 return [
  "/instructions <instructions ....>",
  "  - With no arguments: View current instructions",
  "  - With instructions: Set new instructions"
 ]
}

