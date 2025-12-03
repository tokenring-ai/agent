export type TreeLeaf = {
  name: string;
  value?: string;
  hasChildren?: boolean;
  children?: Array<TreeLeaf> | (() => Promise<TreeLeaf[]> | TreeLeaf[]);
};

export type HumanInterfaceDefinitions = {
  askForConfirmation: {
    request: { message: string; default?: boolean; timeout?: number };
    response: boolean;
  };
  openWebPage: {
    request: { url: string };
    response: boolean;
  };
  askForText: {
    request: { message: string };
    response: string | null;
  };
  askForPassword: {
    request: { message: string };
    response: string | null;
  };
  askForSingleTreeSelection: {
    request: { message?: string; tree: TreeLeaf; initialSelection?: string; loop?: boolean };
    response: string | null;
  };
  askForMultipleTreeSelection: {
    request: { message?: string; tree: TreeLeaf; initialSelection?: Iterable<string>; loop?: boolean };
    response: string[] | null;
  };
};

// Derive all types automatically
export type HumanInterfaceType = keyof HumanInterfaceDefinitions;

export type HumanInterfaceRequestFor<T extends HumanInterfaceType> =
  { type: T } & HumanInterfaceDefinitions[T]["request"];

export type HumanInterfaceResponseFor<T extends HumanInterfaceType> =
  HumanInterfaceDefinitions[T]["response"];

// Union types (if you still need them)
export type HumanInterfaceRequest = {
  [K in HumanInterfaceType]: HumanInterfaceRequestFor<K>;
}[HumanInterfaceType];

export type HumanInterfaceResponse = {
  [K in HumanInterfaceType]: HumanInterfaceResponseFor<K>;
}[HumanInterfaceType];