import { z } from "zod";

export const TreeLeafSchema: z.ZodType<TreeLeaf> = z.lazy(() =>
  z.union([
    z.object({
      name: z.string(),
      value: z.string(),
    }),
    z.object({
      name: z.string(),
      children: z.array(TreeLeafSchema),
    }),
  ]),
);

export type TreeLeaf =
  | {
      name: string;
      value: string;
    }
  | {
      name: string;
      children: Array<TreeLeaf>;
    };

export function isTreeBranch(node: TreeLeaf): node is Extract<TreeLeaf, { children: Array<TreeLeaf> }> {
  return "children" in node;
}

export function isTreeValueLeaf(node: TreeLeaf): node is Extract<TreeLeaf, { value: string }> {
  return "value" in node;
}

export function getTreeNodeValue(node: TreeLeaf): string {
  return isTreeValueLeaf(node) ? node.value : node.name;
}

export const TextQuestionSchema = z.object({
  type: z.literal("text"),
  label: z.string(),
  description: z.string().exactOptional(),
  required: z.boolean().default(false),
  defaultValue: z.string().default(""),
  expectedLines: z.number().default(1),
  masked: z.boolean().default(false), // Hides the data typed in, for passwords
  autoSubmitAfter: z.number().exactOptional(),
});

export type TextQuestion = z.input<typeof TextQuestionSchema>;
export type ParsedTextQuestion = z.output<typeof TextQuestionSchema>;

export const TreeSelectQuestionSchema = z.object({
  type: z.literal("treeSelect"),
  label: z.string(),
  description: z.string().exactOptional(),
  minimumSelections: z.number().exactOptional(),
  maximumSelections: z.number().exactOptional(),
  defaultValue: z.array(z.string()).default([]),
  allowFreeform: z.boolean().default(false),
  tree: z.array(TreeLeafSchema),
});

export type TreeSelectQuestion = z.input<typeof TreeSelectQuestionSchema>;
export type ParsedTreeSelectQuestion = z.output<typeof TreeSelectQuestionSchema>;

export const FileSelectQuestionSchema = z.object({
  type: z.literal("fileSelect"),
  allowFiles: z.boolean(),
  allowDirectories: z.boolean(),
  label: z.string(),
  description: z.string().exactOptional(),
  minimumSelections: z.number().exactOptional(),
  maximumSelections: z.number().exactOptional(),
  defaultValue: z.array(z.string()).default([]),
});

export type FileSelectQuestion = z.input<typeof FileSelectQuestionSchema>;
export type ParsedFileSelectQuestion = z.output<typeof FileSelectQuestionSchema>;

export const PrimitiveQuestionsSchema = z.discriminatedUnion("type", [TextQuestionSchema, FileSelectQuestionSchema, TreeSelectQuestionSchema]);

export const FormSectionSchema = z.object({
  name: z.string(),
  description: z.string().exactOptional(),
  fields: z.record(z.string(), PrimitiveQuestionsSchema),
});

export const FormQuestionSchema = z.object({
  type: z.literal("form"),
  sections: z.array(FormSectionSchema),
});

export type FormQuestion = z.input<typeof FormQuestionSchema>;
export type ParsedFormQuestion = z.output<typeof FormQuestionSchema>;

export const QuestionSchema = z.discriminatedUnion("type", [TextQuestionSchema, FileSelectQuestionSchema, TreeSelectQuestionSchema, FormQuestionSchema]);

export type ResultTypeForSection<T extends z.input<typeof FormSectionSchema>> = {
  [K in keyof T["fields"]]: ResultTypeForQuestion<T["fields"][K]>;
};

export type ResultTypeForQuestion<T extends z.input<typeof QuestionSchema>> = T extends { type: "text" }
  ? T["required"] extends true
    ? string
    : string | null
  : T extends { type: "fileSelect" }
    ? string[]
    : T extends { type: "treeSelect" }
      ? string[]
      : T extends { type: "form" }
        ? {
            // Iterate over the union of elements in the 'sections' array
            [S in T["sections"][number] as S["name"]]: ResultTypeForSection<S>;
          }
        : never;

export function getDefaultQuestionValue<T extends ParsedTextQuestion | ParsedFormQuestion | ParsedFileSelectQuestion | ParsedTreeSelectQuestion>(
  field: T,
): ResultTypeForQuestion<T> {
  switch (field.type) {
    case "form": {
      const result: Record<string, Record<string, any>> = {};
      for (const section of field.sections) {
        const sectionFields: ResultTypeForSection<typeof section> = {};
        for (const [key, childField] of Object.entries(section.fields)) {
          sectionFields[key] = getDefaultQuestionValue(childField);
        }
        result[section.name] = sectionFields;
      }
      return result as ResultTypeForQuestion<T>;
    }
    case "text":
      return field.defaultValue as ResultTypeForQuestion<T>;
    case "treeSelect":
      return field.defaultValue as ResultTypeForQuestion<T>;
    case "fileSelect":
      return field.defaultValue as ResultTypeForQuestion<T>;
    default: {
      // noinspection JSUnusedLocalSymbols
      const _foo: never = field;
      throw new Error(`Unsupported field type`);
    }
  }
}
