import {Agent} from "@tokenring-ai/agent";

export default async function execute(remainder: string, agent: Agent): Promise<void> {
  const type = remainder.trim().toLowerCase();
  
  switch (type) {
    case "text":
      const textResult = await agent.askForText({
        message: "Testing text input",
        label: "Enter some text:"
      });
      agent.infoMessage(`You entered: ${textResult}`);
      break;
      
    case "confirm":
      const confirmResult = await agent.askForConfirmation({
        message: "Testing confirmation dialog",
        label: "Do you agree?",
        default: true
      });
      agent.infoMessage(`You selected: ${confirmResult ? "Yes" : "No"}`);
      break;
      
    case "tree":
      const treeResult = await agent.askQuestion({
        message: "Testing tree select",
        question: {
          type: 'treeSelect',
          label: "Select from tree:",
          tree: [
            {
              name: "root",
              children: [
                {name: "Frontend", value: "frontend", children: [
                  {name: "React", value: "react"},
                  {name: "Vue", value: "vue"}
                ]},
                {name: "Backend", value: "backend", children: [
                  {name: "Node.js", value: "node"},
                  {name: "Python", value: "python"}
                ]}
              ]
            }
          ]
        }
      });
      agent.infoMessage(`You selected: ${treeResult?.join(", ") || "nothing"}`);
      break;
      
    case "file":
      const fileResult = await agent.askQuestion({
        message: "Testing file select",
        question: {
          type: 'fileSelect',
          label: "Select files:",
          allowFiles: true,
          allowDirectories: true,
          minimumSelections: 1,
          maximumSelections: 5
        }
      });
      agent.infoMessage(`You selected: ${fileResult?.join(", ") || "nothing"}`);
      break;
      
    case "form":
      const formResult = await agent.askQuestion({
        message: "Testing form with multiple sections",
        question: {
          type: 'form',
          sections: [
            {
              name: "Personal Information",
              description: "Enter your basic information",
              fields: {
                name: {
                  type: 'text',
                  label: "Full Name",
                  required: true,
                  expectedLines: 1
                },
                email: {
                  type: 'text',
                  label: "Email Address",
                  required: true,
                  expectedLines: 1
                },
                bio: {
                  type: 'text',
                  label: "Bio",
                  required: false,
                  expectedLines: 3
                }
              }
            },
            {
              name: "Skills",
              description: "Select your technical skills",
              fields: {
                backend: {
                  type: 'treeSelect',
                  label: "Backend Technologies",
                  tree: [
                    {
                      name: "Backend",
                      children: [
                        {
                          name: "Node.js Frameworks",
                          value: "nodejs",
                          children: [
                            {name: "Express", value: "express"},
                            {name: "NestJS", value: "nestjs"},
                            {name: "Fastify", value: "fastify"}
                          ]
                        },
                        {
                          name: "Python Frameworks",
                          value: "python",
                          children: [
                            {name: "Django", value: "django"},
                            {name: "FastAPI", value: "fastapi"},
                            {name: "Flask", value: "flask"}
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ]
        }
      });
      agent.infoMessage(`Form results: ${JSON.stringify(formResult, null, 2)}`);
      break;
      
    default:
      agent.errorMessage(`Unknown question type: ${type}. Use: text, confirm, tree, file, or form`);
  }
}
