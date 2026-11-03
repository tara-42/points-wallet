import { z } from "zod";

// LLM extraction schemas

export const ModificationEditSchema = z.object({
  target: z.enum(["ingredients", "instructions"]),
  operation: z.enum(["replace", "add_after", "remove"]),
  find: z.string(),
  replace: z.string().optional(),
  add: z.string().optional(),
});

export const ModificationObjectSchema = z.object({
  modification_type: z.enum([
    "ingredient_substitution",
    "quantity_adjustment",
    "technique_change",
    "addition",
    "removal",
  ]),
  reasoning: z.string(),
  edits: z.array(ModificationEditSchema),
});

export type ModificationEdit = z.infer<typeof ModificationEditSchema>;
export type ModificationObject = z.infer<typeof ModificationObjectSchema>;

// Change tracking

export const ChangeRecordSchema = z.object({
  type: z.enum(["ingredient", "instruction"]),
  fromText: z.string(),
  toText: z.string(),
  operation: z.enum(["replace", "add", "remove"]),
});

export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;

// Source review for attribution

export const SourceReviewSchema = z.object({
  text: z.string(),
  reviewer: z.string().optional(),
  rating: z.number().optional(),
});

export type SourceReview = z.infer<typeof SourceReviewSchema>;

// Enhancement summary

export const EnhancementSummarySchema = z.object({
  totalChanges: z.number(),
  changeTypes: z.array(z.string()),
  expectedImpact: z.string(),
});

export type EnhancementSummary = z.infer<typeof EnhancementSummarySchema>;

// Modification applied record

export const ModificationAppliedSchema = z.object({
  sourceReview: SourceReviewSchema,
  modificationType: z.string(),
  reasoning: z.string(),
  changesMade: z.array(ChangeRecordSchema),
});

export type ModificationApplied = z.infer<typeof ModificationAppliedSchema>;

// Scraped recipe data schema (for parsing Browser Rendering API response)

export const ScrapedRecipeDataSchema = z.object({
  url: z.string(),
  recipeId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  ingredients: z.array(z.string()).default([]),
  instructions: z.array(z.string()).default([]),
  rating: z
    .object({
      value: z.number(),
      count: z.number(),
    })
    .optional(),
  nutrition: z.record(z.unknown()).optional(),
  prepTime: z.string().optional(),
  cookTime: z.string().optional(),
  totalTime: z.string().optional(),
  servings: z.string().optional(),
  author: z.string().optional(),
});

export type ScrapedRecipeData = z.infer<typeof ScrapedRecipeDataSchema>;

// Scraped review data schema

export const ScrapedReviewDataSchema = z.object({
  text: z.string(),
  rating: z.number().optional(),
  username: z.string().optional(),
  date: z.string().optional(),
  hasModification: z.boolean().default(false),
});

export type ScrapedReviewData = z.infer<typeof ScrapedReviewDataSchema>;
