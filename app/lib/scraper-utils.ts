/**
 * Utility functions for parsing scraped recipe data.
 *
 * These functions handle extraction and parsing of recipe data from
 * the Cloudflare Browser Rendering API response.
 */

import type {
  ScrapedRecipeData,
  ScrapedReviewData,
} from "@/models/recipe";

/**
 * Browser Rendering API element result structure
 */
interface ScrapeElementResult {
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
}

interface ScrapeApiResponse {
  success: boolean;
  result: ScrapeElementResult[];
}

/**
 * Extract recipe data from JSON-LD structured data.
 * Recursively searches for Recipe type in JSON-LD.
 */
export function extractRecipeFromJsonLd(
  data: unknown
): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const recipe = extractRecipeFromJsonLd(item);
      if (recipe) return recipe;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;
  const types = obj["@type"];

  if (Array.isArray(types) && types.includes("Recipe")) {
    return obj;
  }
  if (types === "Recipe") {
    return obj;
  }

  // Check @graph array
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const recipe = extractRecipeFromJsonLd(item);
      if (recipe) return recipe;
    }
  }

  return null;
}

/**
 * Parse JSON-LD scripts from Browser Rendering API response.
 */
export function parseJsonLdFromScrapeResponse(
  response: ScrapeApiResponse
): ScrapedRecipeData | null {
  const jsonLdResult = response.result.find(
    (r) => r.selector === 'script[type="application/ld+json"]'
  );

  if (!jsonLdResult || jsonLdResult.results.length === 0) {
    return null;
  }

  for (const element of jsonLdResult.results) {
    try {
      const parsed = JSON.parse(element.text);
      const recipeData = extractRecipeFromJsonLd(parsed);

      if (recipeData) {
        return parseRecipeJsonLd(recipeData);
      }
    } catch {
      // Continue to next script if JSON parsing fails
      continue;
    }
  }

  return null;
}

/**
 * Parse structured recipe data from JSON-LD object.
 */
function parseRecipeJsonLd(
  data: Record<string, unknown>
): ScrapedRecipeData | null {
  const title = (data.name as string) || "";
  if (!title) return null;

  // Parse ingredients
  const ingredients: string[] = [];
  if (Array.isArray(data.recipeIngredient)) {
    for (const ing of data.recipeIngredient) {
      if (typeof ing === "string") {
        ingredients.push(ing);
      }
    }
  }

  // Parse instructions
  const instructions: string[] = [];
  if (Array.isArray(data.recipeInstructions)) {
    for (const inst of data.recipeInstructions) {
      if (typeof inst === "string") {
        instructions.push(inst);
      } else if (typeof inst === "object" && inst !== null) {
        const instObj = inst as Record<string, unknown>;
        const text =
          (instObj.text as string) || (instObj.name as string) || "";
        if (text) {
          instructions.push(text);
        }
      }
    }
  }

  // Parse rating
  let rating: { value: number; count: number } | undefined;
  if (data.aggregateRating && typeof data.aggregateRating === "object") {
    const agg = data.aggregateRating as Record<string, unknown>;
    const value = Number(agg.ratingValue);
    const count = Number(agg.ratingCount || agg.reviewCount);
    if (!isNaN(value) && !isNaN(count)) {
      rating = { value, count };
    }
  }

  // Parse servings
  let servings: string | undefined;
  const recipeYield = data.recipeYield;
  if (Array.isArray(recipeYield)) {
    servings = String(recipeYield[0]);
  } else if (recipeYield) {
    servings = String(recipeYield);
  }

  // Parse author
  let author: string | undefined;
  if (data.author) {
    if (typeof data.author === "string") {
      author = data.author;
    } else if (typeof data.author === "object") {
      const authorObj = data.author as Record<string, unknown>;
      author = (authorObj.name as string) || undefined;
    }
  }

  return {
    url: "",
    title,
    description: (data.description as string) || undefined,
    ingredients,
    instructions,
    rating,
    nutrition: data.nutrition as Record<string, unknown> | undefined,
    prepTime: (data.prepTime as string) || undefined,
    cookTime: (data.cookTime as string) || undefined,
    totalTime: (data.totalTime as string) || undefined,
    servings,
    author,
  };
}

/**
 * Parse reviews from Browser Rendering API response.
 */
export function parseReviewsFromScrapeResponse(
  response: ScrapeApiResponse
): ScrapedReviewData[] {
  const reviewResult = response.result.find((r) =>
    r.selector.includes("review")
  );

  if (!reviewResult || reviewResult.results.length === 0) {
    return [];
  }

  const reviews: ScrapedReviewData[] = [];

  for (const element of reviewResult.results) {
    const review = parseReviewElement(element);
    if (review && review.text) {
      reviews.push(review);
    }
  }

  return reviews;
}

/**
 * Parse a single review element.
 */
function parseReviewElement(element: {
  text: string;
  html: string;
  attributes: Array<{ name: string; value: string }>;
}): ScrapedReviewData | null {
  const text = element.text.trim();
  if (!text) return null;

  // Try to extract rating from aria-label or data attributes
  let rating: number | undefined;
  for (const attr of element.attributes) {
    if (attr.name === "aria-label" || attr.name === "data-rating") {
      const match = attr.value.match(/(\d+)/);
      if (match) {
        rating = parseInt(match[1], 10);
        break;
      }
    }
  }

  return {
    text,
    rating,
    hasModification: detectModificationPatterns(text),
  };
}

/**
 * Detect if a review text contains modification patterns.
 * Based on the Python implementation's tweak detection logic.
 */
export function detectModificationPatterns(text: string): boolean {
  const patterns = [
    /I (added|used|substituted|replaced|made with|changed)/i,
    /(instead of|rather than|in place of)/i,
    /(next time|will make again|definitely make)/i,
    /(doubled|tripled|halved|increased|decreased)/i,
    /(more|less|extra) [\w\s]+/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract recipe ID from URL.
 */
export function extractRecipeIdFromUrl(url: string): string | undefined {
  const parts = url.split("/");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "recipe" && i + 1 < parts.length) {
      return parts[i + 1];
    }
  }
  return undefined;
}

/**
 * Generate a unique ID for a recipe or review.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Parse the full scrape response and extract recipe + reviews.
 */
export function parseScrapeResponse(
  url: string,
  response: ScrapeApiResponse
): {
  recipe: ScrapedRecipeData | null;
  reviews: ScrapedReviewData[];
} {
  const recipe = parseJsonLdFromScrapeResponse(response);

  if (recipe) {
    recipe.url = url;
    recipe.recipeId = extractRecipeIdFromUrl(url);
  }

  const reviews = parseReviewsFromScrapeResponse(response);

  return { recipe, reviews };
}
