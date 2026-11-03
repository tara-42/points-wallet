/**
 * LLM prompts for recipe modification extraction.
 *
 * These prompts are used to extract structured modifications from user review text
 * using Cloudflare AI.
 */

export const SYSTEM_PROMPT = `You are an expert recipe analyst. Your job is to extract structured recipe modifications from user reviews.

When a user shares their experience modifying a recipe, you need to:
1. Identify exactly what changes they made
2. Understand why they made those changes
3. Convert their modifications into structured edit operations

You must output valid JSON that matches the ModificationObject schema. Output ONLY raw JSON - no markdown code blocks, no backticks, no explanatory text.

Categories:
- "ingredient_substitution": Replacing one ingredient with another
- "quantity_adjustment": Changing amounts of existing ingredients
- "technique_change": Altering cooking method, temperature, time
- "addition": Adding new ingredients or steps
- "removal": Removing ingredients or steps

Edit operations:
- "replace": Find existing text and replace it
- "add_after": Add new text after finding target text
- "remove": Remove text that matches the find pattern

Be precise with text matching - use the exact text from the original recipe when possible.`;

export function buildExtractionPrompt(
  reviewText: string,
  recipe: { title: string; ingredients: string[]; instructions: string[] }
): string {
  return `${SYSTEM_PROMPT}

Original Recipe:
Title: ${recipe.title}
Ingredients: ${JSON.stringify(recipe.ingredients, null, 2)}
Instructions: ${JSON.stringify(recipe.instructions, null, 2)}

User Review: "${reviewText}"

Extract the recipe modifications from this review. The user has made changes to improve the recipe.

Output a JSON object with this structure:
{
  "modification_type": "quantity_adjustment|ingredient_substitution|technique_change|addition|removal",
  "reasoning": "Brief explanation of why this modification improves the recipe",
  "edits": [
    {
      "target": "ingredients|instructions",
      "operation": "replace|add_after|remove",
      "find": "exact text to find",
      "replace": "replacement text (for replace operations)",
      "add": "text to add (for add_after operations)"
    }
  ]
}

Focus on concrete changes the user actually made, not general suggestions.

IMPORTANT: Output ONLY the raw JSON object. Do NOT wrap the response in markdown code blocks (no \`\`\`json). Do NOT include any text before or after the JSON. Start your response with { and end with }.`;
}

/**
 * Few-shot examples for better extraction accuracy.
 * Can be included in prompts for more complex cases.
 */
export const FEW_SHOT_EXAMPLES = [
  {
    review:
      "I used a half cup of sugar and one-and-a-half cups of brown sugar instead of the recipe amounts. Made the cookies much more chewy and flavorful!",
    expectedOutput: {
      modification_type: "quantity_adjustment",
      reasoning:
        "Makes cookies more chewy and flavorful by increasing brown sugar ratio",
      edits: [
        {
          target: "ingredients",
          operation: "replace",
          find: "1 cup white sugar",
          replace: "0.5 cup white sugar",
        },
        {
          target: "ingredients",
          operation: "replace",
          find: "1 cup packed brown sugar",
          replace: "1.5 cups packed brown sugar",
        },
      ],
    },
  },
  {
    review:
      "I added a teaspoon of cream of tartar to the batter and omitted the water. The cookies retained their shape and didn't spread when baked.",
    expectedOutput: {
      modification_type: "addition",
      reasoning:
        "Helps cookies retain shape and prevents spreading during baking",
      edits: [
        {
          target: "ingredients",
          operation: "add_after",
          find: "0.5 teaspoon salt",
          add: "1 teaspoon cream of tartar",
        },
        {
          target: "ingredients",
          operation: "remove",
          find: "2 teaspoons hot water",
        },
      ],
    },
  },
  {
    review:
      "I baked them at 375 degrees instead of 350 for about 8-9 minutes. They came out perfectly crispy on the edges.",
    expectedOutput: {
      modification_type: "technique_change",
      reasoning: "Higher temperature and shorter time creates crispier edges",
      edits: [
        {
          target: "instructions",
          operation: "replace",
          find: "350 degrees F",
          replace: "375 degrees F",
        },
        {
          target: "instructions",
          operation: "replace",
          find: "about 10 minutes",
          replace: "about 8-9 minutes",
        },
      ],
    },
  },
];

export function buildFewShotPrompt(
  reviewText: string,
  recipe: { title: string; ingredients: string[]; instructions: string[] }
): string {
  const examplesText = FEW_SHOT_EXAMPLES.slice(0, 2)
    .map(
      (example, i) =>
        `Example ${i + 1}:\nReview: "${example.review}"\nOutput: ${JSON.stringify(example.expectedOutput, null, 2)}`
    )
    .join("\n\n");

  return `${SYSTEM_PROMPT}

Here are some examples of how to extract modifications:

${examplesText}

Now extract from this review:

Original Recipe:
Title: ${recipe.title}
Ingredients: ${JSON.stringify(recipe.ingredients, null, 2)}
Instructions: ${JSON.stringify(recipe.instructions, null, 2)}

User Review: "${reviewText}"

Extract the recipe modifications from this review. The user has made changes to improve the recipe.

IMPORTANT: Output ONLY the raw JSON object. Do NOT wrap the response in markdown code blocks (no \`\`\`json). Do NOT include any text before or after the JSON. Start your response with { and end with }.`;
}
