import { z } from "zod";

export const TreeLeafSchema: z.ZodType<TreeLeaf> = z.lazy(() =>
  z.object({
    name: z.string(),
    value: z.string().optional(),
    hasChildren: z.boolean().optional(),
    children: z
      .union([
        z.array(TreeLeafSchema),
        z.function({
          input: z.never(),
          output: z.union([
            z.array(TreeLeafSchema),
            z.promise(z.array(TreeLeafSchema)),
          ])
        })
      ])
      .optional(),
  })
);

export type TreeLeaf = {
  name: string;
  value?: string;
  hasChildren?: boolean;
  children?: Array<TreeLeaf> | (() => Promise<TreeLeaf[]> | TreeLeaf[]);
};

export const AskForConfirmationRequestSchema = z.object({
  type: z.literal("askForConfirmation"),
  message: z.string(),
  default: z.boolean().optional(),
  timeout: z.number().optional(),
});

export const AskForConfirmationResponseSchema = z.boolean();

export const OpenWebPageRequestSchema = z.object({
  type: z.literal("openWebPage"),
  url: z.string(),
});

export const OpenWebPageResponseSchema = z.boolean();

export const AskForTextRequestSchema = z.object({
  type: z.literal("askForText"),
  message: z.string(),
});

export const AskForTextResponseSchema = z.string().nullable();

export const AskForPasswordRequestSchema = z.object({
  type: z.literal("askForPassword"),
  message: z.string(),
});

export const AskForPasswordResponseSchema = z.string().nullable();

export const AskForSingleTreeSelectionRequestSchema = z.object({
  type: z.literal("askForSingleTreeSelection"),
  message: z.string().optional(),
  tree: TreeLeafSchema,
  initialSelection: z.string().optional(),
  loop: z.boolean().optional(),
  default: z.string().optional(),
  timeout: z.number().optional(),
});

export const AskForSingleTreeSelectionResponseSchema = z.string().nullable();

export const AskForMultipleTreeSelectionRequestSchema = z.object({
  type: z.literal("askForMultipleTreeSelection"),
  message: z.string().optional(),
  tree: TreeLeafSchema,
  initialSelection: z.array(z.string()).optional(),
  loop: z.boolean().optional(),
  default: z.array(z.string()).optional(),
  timeout: z.number().optional(),
});

export const AskForMultipleTreeSelectionResponseSchema = z.array(z.string()).nullable();

export const HumanInterfaceRequestSchema = z.discriminatedUnion("type", [
  AskForConfirmationRequestSchema,
  OpenWebPageRequestSchema,
  AskForTextRequestSchema,
  AskForPasswordRequestSchema,
  AskForSingleTreeSelectionRequestSchema,
  AskForMultipleTreeSelectionRequestSchema,
]);


export type HumanInterfaceDefinitions = z.infer<typeof HumanInterfaceDefinitionSchemas> &{
  askForConfirmation: {
    request: z.infer<typeof AskForConfirmationRequestSchema>;
    response: z.infer<typeof AskForConfirmationResponseSchema>;
  };
  openWebPage: {
    request: z.infer<typeof OpenWebPageRequestSchema>;
    response: z.infer<typeof OpenWebPageResponseSchema>;
  };
  askForText: {
    request: z.infer<typeof AskForTextRequestSchema>;
    response: z.infer<typeof AskForTextResponseSchema>;
  };
  askForPassword: {
    request: z.infer<typeof AskForPasswordRequestSchema>;
    response: z.infer<typeof AskForPasswordResponseSchema>;
  };
  askForSingleTreeSelection: {
    request: z.infer<typeof AskForSingleTreeSelectionRequestSchema>;
    response: z.infer<typeof AskForSingleTreeSelectionResponseSchema>;
  };
  askForMultipleTreeSelection: {
    request: z.infer<typeof AskForMultipleTreeSelectionRequestSchema>;
    response: z.infer<typeof AskForMultipleTreeSelectionResponseSchema>;
  };
};

export const HumanInterfaceDefinitionSchemas = {
  askForConfirmation: {
    request: AskForConfirmationRequestSchema,
    response: AskForConfirmationResponseSchema,
  },
  openWebPage: {
    request: OpenWebPageRequestSchema,
    response: OpenWebPageResponseSchema,
  },
  askForText: {
    request: AskForTextRequestSchema,
    response: AskForTextResponseSchema,
  },
  askForPassword: {
    request: AskForPasswordRequestSchema,
    response: AskForPasswordResponseSchema,
  },
  askForSingleTreeSelection: {
    request: AskForSingleTreeSelectionRequestSchema,
    response: AskForSingleTreeSelectionResponseSchema,
  },
  askForMultipleTreeSelection: {
    request: AskForMultipleTreeSelectionRequestSchema,
    response: AskForMultipleTreeSelectionResponseSchema,
  },
} as const;

export type HumanInterfaceType = keyof HumanInterfaceDefinitions;

export type HumanInterfaceRequestFor<T extends HumanInterfaceType> =
  { type: T } & HumanInterfaceDefinitions[T]["request"];

export type HumanInterfaceResponseFor<T extends HumanInterfaceType> =
  HumanInterfaceDefinitions[T]["response"];

export type HumanInterfaceRequest = {
  [K in HumanInterfaceType]: HumanInterfaceRequestFor<K>;
}[HumanInterfaceType];

export type HumanInterfaceResponse = {
  [K in HumanInterfaceType]: HumanInterfaceResponseFor<K>;
}[HumanInterfaceType];