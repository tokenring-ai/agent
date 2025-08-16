import {FileSystemService} from "@token-ring/filesystem";
import {Service} from "@token-ring/registry";

export type TreeLeaf = {
  name: string;
  value?: string;
  hasChildren?: boolean;
  children?: Array<TreeLeaf> | (() => Promise<Array<TreeLeaf>>) | (() => Array<TreeLeaf>);
};

export default abstract class HumanInterfaceService extends Service {
  /**
   * The name of the service
   */
  name = "HumanInterfaceService" as const;

  /**
   * Description of the service's functionality
   */
  description =
    "Provides a way to ask the user for a selection from a list of items.";

  /**
   * Asks the user to select an item from a list.
   */
  abstract askForSelection(options: {
    title: string;
    items: Array<string>;
  }): Promise<string>;

  /**
   * Asks the user a question and allows them to type in a multi-line answer.
   */
  // Keep underscore to signal potential unused param to subclasses
  abstract ask(_question: string): Promise<string>;

  /**
   * Asks the user to select multiple items from a list.
   */
  abstract askForMultipleSelections(options: {
    title: string;
    items: Array<string>;
    message?: string;
  }): Promise<Array<string>>;

  /**
   * Asks the user to select an item from a tree structure
   */
  async askForSingleTreeSelection(_options: {
    message?: string;
    tree: TreeLeaf;
    allowCancel?: boolean;
    initialSelection?: string | Array<string>;
    loop?: boolean;
  }): Promise<string> {
    throw new Error('Method "askForSingleTreeSelection()" must be implemented by subclass.');
  }


  /**
   * Asks the user to select multiple items from a tree structure
   */
  async askForMultipleTreeSelection(_options: {
    message?: string;
    tree: TreeLeaf;
    allowCancel?: boolean;
    initialSelection?: string | Array<string>;
    loop?: boolean;
  }): Promise<string[]> {
    throw new Error('Method "askForSingleTreeSelection()" must be implemented by subclass.');
  }


  /**
   * Asks the user to select an item from a tree structure using a REPL interface.
   * @param fileSystem - The filesystem interface to use for the selection
   * @param options - Optional configuration for the file selection
   */
  async askForFileSelection(
    fileSystem: FileSystemService,
    options: { initialSelection?: string | Array<string> } = {},
  ): Promise<string | Array<string>> {
    const buildTree = async (path = ""): Promise<Array<TreeLeaf>> => {
      const children: Array<TreeLeaf> = [];

      try {
        for await (const itemPath of fileSystem.getDirectoryTree(path, {
          recursive: false,
        })) {
          if (itemPath.endsWith("/")) {
            // Directory
            const dirName = itemPath.substring(0, itemPath.length - 1).split("/").pop()!;
            children.push({
              name: dirName,
              value: itemPath,
              hasChildren: true,
              children: () => buildTree(itemPath),
            });
          } else {
            // File
            const fileName = itemPath.split("/").pop()!;
            children.push({
              name: fileName,
              value: itemPath,
            });
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${path}:`, error);
      }

      return children;
    };

    const {initialSelection} = options;

    return await this.askForMultipleTreeSelection({
      message: "Select a file or directory:",
      tree: {
        name: "File Selection",
        children: buildTree,
      },
      allowCancel: true,
      loop: false,
      ...(initialSelection && {initialSelection}),
    });
  }
}
