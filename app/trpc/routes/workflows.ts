import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "..";

export const workflowsRouter = createTRPCRouter({
  /**
   * Scrape a recipe from an AllRecipes URL.
   * Creates a new ScraperWorkflow instance.
   */
  scrapeRecipe: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const instance = await ctx.workflows.ScraperWorkflow.create({
        params: { url: input.url },
      });

      return {
        instanceId: instance.id,
        message: `Scraper workflow started for ${input.url}`,
      };
    }),

  /**
   * Run the LLM pipeline on a scraped recipe.
   * Creates a new PipelineWorkflow instance.
   */
  runPipeline: publicProcedure
    .input(
      z.object({
        recipeId: z.string(),
        reviewId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const instance = await ctx.workflows.PipelineWorkflow.create({
        params: {
          recipeId: input.recipeId,
          reviewId: input.reviewId,
        },
      });

      return {
        instanceId: instance.id,
        message: `Pipeline workflow started for recipe ${input.recipeId}`,
      };
    }),

  /**
   * Get the status of a workflow instance.
   */
  getWorkflowStatus: publicProcedure
    .input(
      z.object({
        workflowType: z.enum(["scraper", "pipeline", "example"]),
        instanceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      let workflow;

      switch (input.workflowType) {
        case "scraper":
          workflow = ctx.workflows.ScraperWorkflow;
          break;
        case "pipeline":
          workflow = ctx.workflows.PipelineWorkflow;
          break;
        case "example":
          workflow = ctx.workflows.ExampleWorkflow;
          break;
      }

      const instance = await workflow.get(input.instanceId);
      const status = await instance.status();

      return status;
    }),
});
