// Forgotten-points finder (docs/SPEC.md §3): a deterministic questionnaire. Pure: catalog data is injected.

export type FinderQuestion = { id: string; text: string };
export type FinderProgram = {
  id: string;
  name: string;
  finder: { questionId: string; reason: string };
  recovery: { url: string; identifier: string; tip: string };
};
export type FinderResult = {
  programId: string;
  name: string;
  question: FinderQuestion; // the answer that triggered it
  reason: string;
  identifier: string;
  url: string;
  tip: string;
};

/** Programs whose finder question was answered yes, in catalog order. */
export function findPrograms(input: {
  questions: FinderQuestion[];
  programs: FinderProgram[];
  answers: string[]; // ids of questions answered yes
}): FinderResult[] {
  const yes = new Set(input.answers);
  const questionById = new Map(input.questions.map((q) => [q.id, q]));
  return input.programs.flatMap((p) => {
    const question = questionById.get(p.finder.questionId);
    if (!question || !yes.has(question.id)) return [];
    return [
      {
        programId: p.id,
        name: p.name,
        question,
        reason: p.finder.reason,
        identifier: p.recovery.identifier,
        url: p.recovery.url,
        tip: p.recovery.tip,
      },
    ];
  });
}
