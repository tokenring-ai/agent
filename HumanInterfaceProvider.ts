import {TokenRingService} from "@tokenring-ai/agent/types";

export type TreeLeaf = {
  name: string;
  value?: string;
  hasChildren?: boolean;
  children?: Array<TreeLeaf> | (() => Promise<Array<TreeLeaf>>) | (() => Array<TreeLeaf>);
};


export type AskForConfirmationOptions = {
  message: string;
  default?: boolean;
};


export type AskForSelectionOptions = {
  title: string;
  items: Array<string>;
};

export type AskForMultipleSelectionOptions = {
  title: string;
  items: Iterable<string>;
  message?: string;
};

export type AskForCommandOptions = {
  autoCompletion?: string[];
  history? : string[];
};

export type AskForSingleTreeSelectionOptions = {
  message?: string | undefined;
  tree: TreeLeaf;
  initialSelection?: string | undefined;
  loop?: boolean;
};

export type AskForMultipleTreeSelectionOptions = {
  message?: string | undefined;
  tree: TreeLeaf;
  initialSelection?: Iterable<string> | undefined;
  loop?: boolean;
};

export interface HumanInterfaceProvider extends TokenRingService {
  askForConfirmation(options: AskForConfirmationOptions): Promise<boolean>;

  openWebPage(url: string): Promise<void>;

  /**
   * Asks the user to select an item from a list.
   */
  askForSelection(options: AskForSelectionOptions): Promise<string>;

  /**
   * Asks the user a question and allows them to type in a multi-line answer.
   */
  ask(question: string): Promise<string>;

  /**
   * Asks the user to select multiple items from a list.
   */
  askForMultipleSelections(options: AskForMultipleSelectionOptions): Promise<Array<string>>;

  /**
   * Asks the user to select an item from a tree structure
   */
  askForSingleTreeSelection(options: AskForSingleTreeSelectionOptions): Promise<string | null>;

  /**
   * Asks the user to select multiple items from a tree structure
   */
  askForMultipleTreeSelection(options: AskForMultipleTreeSelectionOptions): Promise<string[] | null>;

}