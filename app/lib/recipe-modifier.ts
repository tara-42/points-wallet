/**
 * Recipe modification utilities.
 *
 * This module applies structured modifications to recipes using
 * fuzzy string matching and search-and-replace operations.
 */

import type {
  ModificationEdit,
  ModificationObject,
  ChangeRecord,
} from "@/models/recipe";

/**
 * Result of a fuzzy string match search.
 */
interface MatchResult {
  match: string | null;
  index: number | null;
  score: number;
}

/**
 * Calculate similarity ratio between two strings.
 * Based on Python's difflib.SequenceMatcher algorithm.
 */
function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1.0;
  if (aLower.length === 0 || bLower.length === 0) return 0.0;

  // Simple Levenshtein-based similarity
  const matrix: number[][] = [];

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[aLower.length][bLower.length];
  const maxLen = Math.max(aLower.length, bLower.length);

  return 1 - distance / maxLen;
}

/**
 * Find the best matching string in a list of candidates.
 */
export function findBestMatch(
  target: string,
  candidates: string[],
  threshold = 0.6
): MatchResult {
  if (candidates.length === 0) {
    return { match: null, index: null, score: 0 };
  }

  let bestMatch: string | null = null;
  let bestIndex: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Check for exact substring match first
    if (
      candidate.toLowerCase().includes(target.toLowerCase()) ||
      target.toLowerCase().includes(candidate.toLowerCase())
    ) {
      const score = calculateSimilarity(target, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
        bestIndex = i;
      }
    } else {
      const score = calculateSimilarity(target, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
        bestIndex = i;
      }
    }
  }

  if (bestScore >= threshold) {
    return { match: bestMatch, index: bestIndex, score: bestScore };
  }

  return { match: null, index: null, score: bestScore };
}

/**
 * Apply a single edit operation to a content array.
 */
export function applyEdit(
  edit: ModificationEdit,
  content: string[]
): {
  modified: string[];
  changes: ChangeRecord[];
} {
  const modified = [...content];
  const changes: ChangeRecord[] = [];
  const changeType = edit.target === "ingredients" ? "ingredient" : "instruction";

  if (edit.operation === "replace") {
    const { match, index, score } = findBestMatch(edit.find, modified);

    if (match !== null && index !== null) {
      const originalText = modified[index];
      const replacement = edit.replace || "";

      // Try to replace just the matched portion within the line
      if (originalText.toLowerCase().includes(edit.find.toLowerCase())) {
        const regex = new RegExp(escapeRegex(edit.find), "i");
        modified[index] = originalText.replace(regex, replacement);
      } else {
        // Full line replacement if fuzzy matched
        modified[index] = replacement;
      }

      changes.push({
        type: changeType,
        fromText: originalText,
        toText: modified[index],
        operation: "replace",
      });

      console.log(
        `Replaced "${edit.find}" with "${replacement}" (similarity: ${score.toFixed(2)})`
      );
    } else {
      console.warn(
        `Could not find "${edit.find}" in ${edit.target} (best similarity: ${score.toFixed(2)})`
      );
    }
  } else if (edit.operation === "add_after") {
    const { match, index, score } = findBestMatch(edit.find, modified);

    if (match !== null && index !== null && edit.add) {
      modified.splice(index + 1, 0, edit.add);

      changes.push({
        type: changeType,
        fromText: "",
        toText: edit.add,
        operation: "add",
      });

      console.log(
        `Added "${edit.add}" after "${edit.find}" (similarity: ${score.toFixed(2)})`
      );
    } else {
      console.warn(`Could not find target "${edit.find}" for addition`);
    }
  } else if (edit.operation === "remove") {
    const { match, index, score } = findBestMatch(edit.find, modified);

    if (match !== null && index !== null) {
      const removedText = modified.splice(index, 1)[0];

      changes.push({
        type: changeType,
        fromText: removedText,
        toText: "",
        operation: "remove",
      });

      console.log(`Removed "${edit.find}" (similarity: ${score.toFixed(2)})`);
    } else {
      console.warn(`Could not find "${edit.find}" to remove`);
    }
  }

  return { modified, changes };
}

/**
 * Apply a complete modification to a recipe.
 */
export function applyModification(
  recipe: { ingredients: string[]; instructions: string[] },
  modification: ModificationObject
): {
  modifiedIngredients: string[];
  modifiedInstructions: string[];
  changeRecords: ChangeRecord[];
} {
  let modifiedIngredients = [...recipe.ingredients];
  let modifiedInstructions = [...recipe.instructions];
  const changeRecords: ChangeRecord[] = [];

  console.log(
    `Applying ${modification.modification_type} with ${modification.edits.length} edits`
  );

  for (const edit of modification.edits) {
    if (edit.target === "ingredients") {
      const { modified, changes } = applyEdit(edit, modifiedIngredients);
      modifiedIngredients = modified;
      changeRecords.push(...changes);
    } else if (edit.target === "instructions") {
      const { modified, changes } = applyEdit(edit, modifiedInstructions);
      modifiedInstructions = modified;
      changeRecords.push(...changes);
    }
  }

  console.log(
    `Applied modification: ${changeRecords.length} changes made`
  );

  return {
    modifiedIngredients,
    modifiedInstructions,
    changeRecords,
  };
}

/**
 * Validate that a modification can be safely applied to a recipe.
 */
export function validateModificationSafety(
  modification: ModificationObject,
  recipe: { ingredients: string[]; instructions: string[] }
): {
  isSafe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let isSafe = true;

  for (const edit of modification.edits) {
    const targetContent =
      edit.target === "ingredients" ? recipe.ingredients : recipe.instructions;

    const { match, score } = findBestMatch(edit.find, targetContent);

    if (!match) {
      warnings.push(`Cannot find "${edit.find}" in ${edit.target}`);
      isSafe = false;
    } else if (score < 0.8) {
      warnings.push(
        `Low similarity match for "${edit.find}" (score: ${score.toFixed(2)})`
      );
    }

    // Validate required fields
    if (edit.operation === "replace" && !edit.replace) {
      warnings.push(
        `Replace operation missing replacement text for "${edit.find}"`
      );
      isSafe = false;
    } else if (edit.operation === "add_after" && !edit.add) {
      warnings.push(
        `Add operation missing text to add after "${edit.find}"`
      );
      isSafe = false;
    }
  }

  return { isSafe, warnings };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
