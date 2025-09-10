import {
  AskForConfirmationOptions,
  AskForMultipleSelectionOptions,
  AskForMultipleTreeSelectionOptions,
  AskForSelectionOptions,
  AskForSingleTreeSelectionOptions
} from "./HumanInterfaceProvider.js";


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
  question: string;
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
  | AskRequest
  | AskForMultipleSelectionsRequest
  | AskForSingleTreeSelectionRequest
  | AskForMultipleTreeSelectionRequest;

