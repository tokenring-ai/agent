import {CommandFailedError} from "../../AgentError.ts";
import {
  AgentCommandInputSchema,
  AgentCommandInputType,
  TokenRingAgentCommand,
} from "../../types.ts";
import {formatAgentCommandUsageError} from "../../util/formatAgentCommandUsage.ts";

const inputSchema = {
  prompt: {
    description: "Question type to test",
    required: true,
  },
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({prompt, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const type = prompt.trim().toLowerCase();

  switch (type) {
    case "text": {
      const result = await agent.askForText({ message: "Testing text input", label: "Enter some text:" });
      return `You entered: ${result}`;
    }
    case "confirm": {
      const result = await agent.askForApproval({ message: "Testing confirmation dialog", label: "Do you agree?", default: true });
      return `You selected: ${result ? "Yes" : "No"}`;
    }
    case "tree": {
      const result = await agent.askQuestion({
        message: "Testing tree select",
        question: {
          type: 'treeSelect',
          label: "Select from tree:",
          tree: [{ name: "root", children: [
            { name: "Frontend", value: "frontend", children: [{ name: "React", value: "react" }, { name: "Vue", value: "vue" }] },
            { name: "Backend", value: "backend", children: [{ name: "Node.js", value: "node" }, { name: "Python", value: "python" }] }
          ]}]
        }
      });
      return `You selected: ${result?.join(", ") || "nothing"}`;
    }
    case "file": {
      const result = await agent.askQuestion({
        message: "Testing file select",
        question: { type: 'fileSelect', label: "Select files:", allowFiles: true, allowDirectories: true, minimumSelections: 1, maximumSelections: 5 }
      });
      return `You selected: ${result?.join(", ") || "nothing"}`;
    }
    case "form": {
      const result = await agent.askQuestion({
        message: "Testing form with multiple sections",
        question: {
          type: 'form',
          sections: [
            {
              name: "Personal Information",
              description: "Enter your basic information",
              fields: {
                name: { type: 'text', label: "Full Name", required: true, expectedLines: 1 },
                email: { type: 'text', label: "Email Address", required: true, expectedLines: 1 },
                bio: { type: 'text', label: "Bio", required: false, expectedLines: 3 }
              }
            },
            {
              name: "Skills",
              description: "Select your technical skills",
              fields: {
                backend: {
                  type: 'treeSelect',
                  label: "Backend Technologies",
                  tree: [{ name: "Backend", children: [
                    { name: "Node.js Frameworks", value: "nodejs", children: [{ name: "Express", value: "express" }, { name: "NestJS", value: "nestjs" }, { name: "Fastify", value: "fastify" }] },
                    { name: "Python Frameworks", value: "python", children: [{ name: "Django", value: "django" }, { name: "FastAPI", value: "fastapi" }, { name: "Flask", value: "flask" }] }
                  ]}]
                }
              }
            }
          ]
        }
      });
      return `Form results: ${JSON.stringify(result, null, 2)}`;
    }
    default:
      throw new CommandFailedError(
        formatAgentCommandUsageError(
          command,
          `Unknown question type: ${type}. Use: text, confirm, tree, file, or form`,
        ),
      );
  }
}

const command = {
  name: "debug questions",
  description: "Test human interface request types",
  inputSchema,
  execute,
  help: "## /debug questions <type>\n\nTest different human interface request types: text, confirm, tree, file, form.",
} satisfies TokenRingAgentCommand<typeof inputSchema>;

export default command;
