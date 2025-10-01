
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
  message: string;
  choices: Array<{ name: string, value: string}>;
};

export type AskForMultipleSelectionOptions = {
  message: string;
  options: Array<{name: string, value: string}>;
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


export interface AskForConfirmationRequest extends AskForConfirmationOptions {
  type: "askForConfirmation";
}

export interface OpenWebPageRequest {
  type: "openWebPage";
  url: string;
}

export interface AskForSelectionRequest extends AskForSelectionOptions {
  type: "askForSelection";
}

export interface AskRequest {
  type: "ask";
  message: string;
}

export interface AskForPasswordOptions {
  type: "askForPassword";
  message: string;
}

export interface AskForMultipleSelectionsRequest extends AskForMultipleSelectionOptions {
  type: "askForMultipleSelections";
}

export interface AskForSingleTreeSelectionRequest extends AskForSingleTreeSelectionOptions {
  type: "askForSingleTreeSelection";
}

export interface AskForMultipleTreeSelectionRequest extends AskForMultipleTreeSelectionOptions {
  type: "askForMultipleTreeSelection";
}

export type HumanInterfaceRequest =
  | AskForConfirmationRequest
  | OpenWebPageRequest
  | AskForSelectionRequest
  | AskForPasswordOptions
  | AskRequest
  | AskForMultipleSelectionsRequest
  | AskForSingleTreeSelectionRequest
  | AskForMultipleTreeSelectionRequest;


export interface HumanInterfaceResponse {
  askForConfirmation: boolean;
  openWebPage: void;
  askForSelection: string;
  askForPassword: string;
  ask: string;
  askForMultipleSelections: string[];
  askForSingleTreeSelection: string | null;
  askForMultipleTreeSelection: string[] | null;
}
