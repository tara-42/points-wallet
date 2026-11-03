import {
  WorkflowEntrypoint,
  WorkflowStep,
  type WorkflowEvent,
} from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { recipe, review, enhancedRecipe } from "../app/db/schema";
import { ModificationObjectSchema } from "../app/models/recipe";
import type {
  ModificationObject,
  ModificationApplied,
  EnhancementSummary,
  ChangeRecord,
  SourceReview,
} from "../app/models/recipe";
import { buildExtractionPrompt } from "../app/lib/prompts";
import {
  applyModification,
  validateModificationSafety,
} from "../app/lib/recipe-modifier";
import { generateId } from "../app/lib/scraper-utils";

export interface PipelineWorkflowPayload {
  recipeId: string;
  reviewId?: string; // Optional: specific review to process
}

/**
 * PipelineWorkflow - LLM analysis and recipe enhancement
 *
 * This workflow:
 * 1. Loads recipe and reviews from D1
 * 2. Selects a review with modification patterns
 * 3. Extracts structured modification using Cloudflare AI
 * 4. Validates modification safety
 * 5. Applies modification with fuzzy matching
 * 6. Generates enhanced recipe with attribution
 * 7. Saves result to D1
 *
 * Available env bindings:
 * - this.env.DATABASE (D1)
 * - this.env.AI (Cloudflare AI)
 */
export class PipelineWorkflow extends WorkflowEntrypoint<
  Env,
  PipelineWorkflowPayload
> {
  async run(event: WorkflowEvent<PipelineWorkflowPayload>, step: WorkflowStep) {
    const { recipeId, reviewId } = event.payload;
    console.log("PipelineWorkflow started", { recipeId, reviewId });

    // Step 1: Load recipe and reviews from D1
    console.log("[Step 1/7] Loading recipe and reviews from D1...");
    const data = await step.do("load-recipe", async () => {
      const db = drizzle(this.env.DATABASE);

      console.log("[Step 1/7] Querying recipe with id:", recipeId);
      const recipeResult = await db
        .select()
        .from(recipe)
        .where(eq(recipe.id, recipeId))
        .limit(1);

      if (recipeResult.length === 0) {
        throw new Error(`Recipe not found: ${recipeId}`);
      }
      console.log("[Step 1/7] Found recipe:", recipeResult[0].title);

      console.log("[Step 1/7] Querying reviews with modifications...");
      const reviewsResult = await db
        .select()
        .from(review)
        .where(
          and(eq(review.recipeId, recipeId), eq(review.hasModification, true))
        );

      console.log(
        "[Step 1/7] Found",
        reviewsResult.length,
        "reviews with modifications"
      );
      return {
        recipe: recipeResult[0],
        reviews: reviewsResult,
      };
    });
    console.log("[Step 1/7] ✓ Recipe and reviews loaded successfully");

    // Step 2: Select a review with modification
    console.log("[Step 2/7] Selecting review with modification...");
    const selectedReview = await step.do("select-review", async () => {
      // If specific review ID provided, use it
      if (reviewId) {
        console.log("[Step 2/7] Looking for specific review:", reviewId);
        const found = data.reviews.find((r) => r.id === reviewId);
        if (!found) {
          throw new Error(`Review not found: ${reviewId}`);
        }
        console.log("[Step 2/7] Found specified review");
        return found;
      }

      // Otherwise select random review with modification
      const modReviews = data.reviews.filter((r) => r.hasModification);
      console.log(
        "[Step 2/7] Found",
        modReviews.length,
        "reviews with hasModification=true"
      );
      if (modReviews.length === 0) {
        throw new Error("No reviews with modifications found");
      }

      const randomIndex = Math.floor(Math.random() * modReviews.length);
      console.log("[Step 2/7] Selected review at index:", randomIndex);
      return modReviews[randomIndex];
    });
    console.log(
      "[Step 2/7] ✓ Review selected:",
      selectedReview.text.substring(0, 100) + "..."
    );

    // Step 3: Extract modification using Cloudflare AI
    console.log("[Step 3/7] Extracting modification using Cloudflare AI...");
    const modification = await step.do(
      "extract-modification",
      {
        retries: { limit: 2, delay: "1 second", backoff: "exponential" },
      },
      async () => {
        const recipeData = {
          title: data.recipe.title,
          ingredients: data.recipe.ingredients || [],
          instructions: data.recipe.instructions || [],
        };
        console.log(
          "[Step 3/7] Building extraction prompt for recipe:",
          recipeData.title
        );

        const prompt = buildExtractionPrompt(selectedReview.text, recipeData);
        console.log("[Step 3/7] Prompt length:", prompt.length, "characters");

        console.log(
          "[Step 3/7] Calling Cloudflare AI (@cf/meta/llama-4-scout-17b-16e-instruct)..."
        );

        const result = await this.env.AI.run(
          "@cf/meta/llama-4-scout-17b-16e-instruct",
          {
            messages: [{ role: "user", content: prompt }],
            response_format: {
              type: "json_object",
              json_schema: ModificationObjectSchema.shape,
            },
          }
        );

        return ModificationObjectSchema.parse(result.response);
      }
    );
    console.log(
      "[Step 3/7] ✓ Modification extracted:",
      modification.modification_type
    );

    // Step 4: Validate modification safety
    console.log("[Step 4/7] Validating modification safety...");
    const validation = await step.do("validate-modification", async () => {
      console.log("[Step 4/7] Running safety validation checks...");
      return validateModificationSafety(modification, {
        ingredients: data.recipe.ingredients || [],
        instructions: data.recipe.instructions || [],
      });
    });

    if (!validation.isSafe) {
      console.warn(
        "[Step 4/7] ✗ Modification validation failed:",
        validation.warnings
      );
      return {
        success: false,
        error: "Modification validation failed",
        warnings: validation.warnings,
      };
    }
    console.log("[Step 4/7] ✓ Modification passed safety validation");

    // Step 5: Apply modification with fuzzy matching
    console.log("[Step 5/7] Applying modification with fuzzy matching...");
    const modificationResult = await step.do("apply-modification", async () => {
      console.log(
        "[Step 5/7] Original ingredients count:",
        (data.recipe.ingredients || []).length
      );
      console.log(
        "[Step 5/7] Original instructions count:",
        (data.recipe.instructions || []).length
      );
      const result = applyModification(
        {
          ingredients: data.recipe.ingredients || [],
          instructions: data.recipe.instructions || [],
        },
        modification
      );
      console.log("[Step 5/7] Changes made:", result.changeRecords.length);
      return result;
    });
    console.log(
      "[Step 5/7] ✓ Modification applied, changes:",
      modificationResult.changeRecords.length
    );

    // Step 6: Generate enhanced recipe with attribution
    console.log("[Step 6/7] Generating enhanced recipe with attribution...");
    const enhanced = await step.do("generate-enhanced", async () => {
      console.log("[Step 6/7] Building source review attribution...");
      const sourceReview: SourceReview = {
        text: selectedReview.text,
        reviewer: selectedReview.username || undefined,
        rating: selectedReview.rating || undefined,
      };

      const modificationApplied: ModificationApplied = {
        sourceReview,
        modificationType: modification.modification_type,
        reasoning: modification.reasoning,
        changesMade: modificationResult.changeRecords,
      };

      const changeTypes = [
        ...new Set(modificationResult.changeRecords.map((c) => c.operation)),
      ];
      console.log("[Step 6/7] Change types:", changeTypes.join(", "));

      const enhancementSummary: EnhancementSummary = {
        totalChanges: modificationResult.changeRecords.length,
        changeTypes,
        expectedImpact: modification.reasoning,
      };

      const enhancedId = generateId();
      console.log("[Step 6/7] Generated enhanced recipe ID:", enhancedId);

      return {
        id: enhancedId,
        originalRecipeId: recipeId,
        title: `${data.recipe.title} (Enhanced)`,
        ingredients: modificationResult.modifiedIngredients,
        instructions: modificationResult.modifiedInstructions,
        modificationsApplied: [modificationApplied],
        enhancementSummary,
      };
    });
    console.log("[Step 6/7] ✓ Enhanced recipe generated:", enhanced.title);

    // Step 7: Save to D1
    console.log("[Step 7/7] Saving enhanced recipe to D1 database...");
    await step.do("save-enhanced", async () => {
      const db = drizzle(this.env.DATABASE);
      const now = new Date();

      console.log("[Step 7/7] Inserting enhanced recipe:", enhanced.id);
      await db.insert(enhancedRecipe).values({
        id: enhanced.id,
        originalRecipeId: enhanced.originalRecipeId,
        title: enhanced.title,
        ingredients: enhanced.ingredients,
        instructions: enhanced.instructions,
        modificationsApplied: enhanced.modificationsApplied,
        enhancementSummary: enhanced.enhancementSummary,
        pipelineVersion: "1.0.0",
        createdAt: now,
        updatedAt: now,
      });
      console.log("[Step 7/7] ✓ Enhanced recipe saved to database");
    });

    console.log("=".repeat(50));
    console.log("PipelineWorkflow COMPLETED SUCCESSFULLY");
    console.log("=".repeat(50));
    console.log({
      enhancedRecipeId: enhanced.id,
      originalRecipeId: recipeId,
      title: enhanced.title,
      modificationType: modification.modification_type,
      changesCount: modificationResult.changeRecords.length,
    });

    return {
      success: true,
      enhancedRecipeId: enhanced.id,
      originalRecipeId: recipeId,
      title: enhanced.title,
      modificationType: modification.modification_type,
      changesCount: modificationResult.changeRecords.length,
      changeTypes: enhanced.enhancementSummary.changeTypes,
    };
  }
}
