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
  name: string = "HumanInterfaceService" as const;

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
    message?: string | undefined;
    tree: TreeLeaf;
    initialSelection?: string | undefined;
    loop?: boolean;
  }): Promise<string | null> {
    throw new Error('Method "askForSingleTreeSelection()" must be implemented by subclass.');
  }


  /**
   * Asks the user to select multiple items from a tree structure
   */
  async askForMultipleTreeSelection(_options: {
    message?: string | undefined;
    tree: TreeLeaf;
    initialSelection?: Array<string> | undefined;
    loop?: boolean;
  }): Promise<string[] | null> {
    throw new Error('Method "askForSingleTreeSelection()" must be implemented by subclass.');
  }


  /**
   * Asks the user to select an item from a tree structure using a REPL interface.
   */
  async askForFileSelection(
    fileSystem: FileSystemService,
    options: { initialSelection?: string[] | undefined } = {},
  ): Promise<Array<string> | null> {
    const buildTree = async (path = ""): Promise<Array<TreeLeaf>> => {
      const children: Array<TreeLeaf> = [];

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

      return children;
    };

    const {initialSelection} = options;

    return await this.askForMultipleTreeSelection({
      message: "Select a file or directory:",
      tree: {
        name: "File Selection",
        children: buildTree,
      },
      loop: false,
      ...(initialSelection && {initialSelection}),
    });
  }
}
