import {
  WorkflowEntrypoint,
  WorkflowStep,
  type WorkflowEvent,
} from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { recipe, review } from "../app/db/schema";
import {
  parseScrapeResponse,
  detectModificationPatterns,
  generateId,
} from "../app/lib/scraper-utils";

export interface ScraperWorkflowPayload {
  url: string;
}

interface ScrapeApiResponse {
  success: boolean;
  result: Array<{
    selector: string;
    results: Array<{
      text: string;
      html: string;
      attributes: Array<{ name: string; value: string }>;
      height: number;
      width: number;
      top: number;
      left: number;
    }>;
  }>;
}

/**
 * ScraperWorkflow - Scrapes recipes from AllRecipes URLs
 *
 * This workflow:
 * 1. Fetches the page using Cloudflare Browser Rendering API
 * 2. Parses JSON-LD structured data for recipe information
 * 3. Extracts reviews from the page
 * 4. Detects modification patterns in reviews
 * 5. Saves recipe and reviews to D1 database
 *
 * Available env bindings:
 * - this.env.DATABASE (D1)
 * - this.env.CF_ACCOUNT_ID (Account ID for API calls)
 * - this.env.CF_API_TOKEN (API token for Browser Rendering)
 */
export class ScraperWorkflow extends WorkflowEntrypoint<
  Env,
  ScraperWorkflowPayload
> {
  async run(event: WorkflowEvent<ScraperWorkflowPayload>, step: WorkflowStep) {
    const { url } = event.payload;
    console.log("ScraperWorkflow started", { url });

    // Step 1: Fetch page via Browser Rendering API
    const pageData = await step.do("fetch-page", async () => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/scrape`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            elements: [
              { selector: 'script[type="application/ld+json"]' },
              { selector: "h1" },
              { selector: ".ugc-review" },
              { selector: '[class*="review"]' },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Browser Rendering API failed: ${response.status} - ${errorText}`
        );
      }

      return response.json() as Promise<ScrapeApiResponse>;
    });

    // Step 2: Parse recipe data from JSON-LD
    const parsedData = await step.do("parse-recipe-data", async () => {
      const result = parseScrapeResponse(url, pageData);

      if (!result.recipe) {
        throw new Error("Could not extract recipe data from page");
      }

      return result;
    });

    // Step 3: Detect modification patterns in reviews
    const reviewsWithFlags = await step.do("detect-modifications", async () => {
      return parsedData.reviews.map((r) => ({
        ...r,
        hasModification: detectModificationPatterns(r.text),
      }));
    });

    // Step 4: Save to D1 database
    const savedData = await step.do("save-to-database", async () => {
      const db = drizzle(this.env.DATABASE);
      const recipeId = generateId();
      const now = new Date();

      // Insert recipe
      await db.insert(recipe).values({
        id: recipeId,
        url: parsedData.recipe!.url,
        title: parsedData.recipe!.title,
        description: parsedData.recipe!.description || null,
        ingredients: parsedData.recipe!.ingredients,
        instructions: parsedData.recipe!.instructions,
        rating: parsedData.recipe!.rating || null,
        nutrition: parsedData.recipe!.nutrition || null,
        prepTime: parsedData.recipe!.prepTime || null,
        cookTime: parsedData.recipe!.cookTime || null,
        totalTime: parsedData.recipe!.totalTime || null,
        servings: parsedData.recipe!.servings || null,
        author: parsedData.recipe!.author || null,
        scrapedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Insert reviews
      const reviewRecords = reviewsWithFlags.map((r) => ({
        id: generateId(),
        recipeId,
        text: r.text,
        rating: r.rating || null,
        username: r.username || null,
        reviewDate: r.date || null,
        hasModification: r.hasModification,
        createdAt: now,
        updatedAt: now,
      }));

      if (reviewRecords.length > 0) {
        await db.insert(review).values(reviewRecords);
      }

      return {
        recipeId,
        reviewCount: reviewRecords.length,
        modificationsFound: reviewRecords.filter((r) => r.hasModification)
          .length,
      };
    });

    console.log("ScraperWorkflow finished", savedData);

    return {
      success: true,
      recipeId: savedData.recipeId,
      title: parsedData.recipe!.title,
      reviewCount: savedData.reviewCount,
      modificationsFound: savedData.modificationsFound,
    };
  }
}
