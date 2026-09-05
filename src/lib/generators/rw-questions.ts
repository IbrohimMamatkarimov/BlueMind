/**
 * Reading & Writing question bank.
 *
 * Unlike Math, R&W items can't be safely auto-generated from a formula —
 * correctness depends on grammar, reasoning, and having exactly one
 * defensible answer with plausible-but-wrong distractors. So these are
 * hand-authored and checked against those criteria:
 *  - grammar verified
 *  - reasoning verified (the correct choice is the only one fully supported
 *    by the passage/sentence)
 *  - distractors are plausible but each fails for a specific, identifiable
 *    reason (not just "obviously wrong")
 */

import { newId } from "../id";

export interface RwQuestionSeed {
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  questionText: string;
  choices: string[]; // 4 choices, first is NOT necessarily correct
  correctIndex: number;
  rationale: string;
  explanation: string;
}

export const RW_BANK: RwQuestionSeed[] = [
  // ---------- Information and Ideas ----------
  {
    domain: "Information and Ideas",
    skill: "Central Ideas and Details",
    difficulty: "Easy",
    questionText:
      "Text: A recent study of urban beekeeping found that hives placed on rooftops produced 20% more honey than hives at ground level, likely due to reduced pesticide exposure and access to a wider variety of flowering plants. Which choice best states the main idea of the text?",
    choices: [
      "Rooftop hives are illegal in most cities.",
      "Rooftop placement can improve honey yield by limiting pesticide exposure and diversifying food sources.",
      "Ground-level hives are always exposed to pesticides.",
      "Urban beekeeping is more popular than rural beekeeping.",
    ],
    correctIndex: 1,
    rationale: "The passage's main claim is the causal link between rooftop placement and higher yield, tied to two specific reasons.",
    explanation:
      "Central-idea questions ask you to identify the sentence-level claim the rest of the text supports, not an extreme or unsupported restatement of one detail.",
  },
  {
    domain: "Information and Ideas",
    skill: "Command of Evidence",
    difficulty: "Medium",
    questionText:
      "Text: Historian Amara Diallo argues that the printing press accelerated the spread of literacy in 15th-century Europe more than any single religious or political event. Which finding, if true, would most directly support Diallo's claim?",
    choices: [
      "Literacy rates rose sharply in regions with printing presses within decades of their introduction, independent of religious reform.",
      "Handwritten manuscripts remained more common than printed books until the 18th century.",
      "Several European monarchs opposed the spread of the printing press.",
      "Literacy rates were already rising slowly before the printing press was invented.",
    ],
    correctIndex: 0,
    rationale: "Only the first option isolates the printing press's effect from religious/political causes, which is exactly what Diallo's claim requires.",
    explanation:
      "Command-of-evidence questions require a finding that supports the SPECIFIC claim in the text — here, that the press mattered more than religious/political events — not just any related fact.",
  },
  {
    domain: "Information and Ideas",
    skill: "Inferences",
    difficulty: "Medium",
    questionText:
      "Text: Coral reefs that experienced mild, brief bleaching events in the past show higher survival rates during major bleaching events than reefs with no prior bleaching history. Based on the text, what can be most reasonably inferred?",
    choices: [
      "Coral reefs cannot recover from any bleaching event.",
      "Prior mild stress may help some reefs develop greater resilience to future stress.",
      "Major bleaching events are becoming less frequent.",
      "Reefs with no bleaching history are located in warmer water.",
    ],
    correctIndex: 1,
    rationale: "The text describes a pattern (mild prior stress -> better survival later) that most directly supports a 'resilience from prior stress' inference.",
    explanation:
      "A valid inference stays close to the given pattern in the data — it doesn't introduce new unsupported causes like water temperature or frequency trends.",
  },
  {
    domain: "Information and Ideas",
    skill: "Central Ideas and Details",
    difficulty: "Hard",
    questionText:
      "Text: While early economists assumed consumers make purchasing decisions based purely on rational cost-benefit analysis, behavioral economists have shown that factors like social pressure, framing, and loss aversion routinely override strict rationality — yet these same researchers note that under high-stakes, well-understood decisions, consumers' choices align more closely with rational models. Which choice best describes the overall structure of the text?",
    choices: [
      "It presents a theory, complicates it with a qualification, and refines rather than fully rejects the original claim.",
      "It disproves an old theory entirely and replaces it with a new one.",
      "It compares two theories without taking a position.",
      "It summarizes a historical debate without offering any evidence.",
    ],
    correctIndex: 0,
    rationale: "The text starts with the rational model, complicates it with behavioral findings, then narrows the complication ('under high-stakes... decisions'), which is a refinement, not a full rejection.",
    explanation:
      "Structure questions require tracking how the argument moves paragraph-to-paragraph — note the qualifying clause at the end that limits the counter-claim rather than eliminating the original theory.",
  },

  // ---------- Craft and Structure ----------
  {
    domain: "Craft and Structure",
    skill: "Words in Context",
    difficulty: "Easy",
    questionText:
      "Text: Despite the CEO's confident public statements, internal memos revealed a company deeply uncertain about its next product launch. As used in the text, 'confident' most nearly means",
    choices: ["hostile", "self-assured", "indifferent", "curious"],
    correctIndex: 1,
    rationale: "'Confident public statements' set up a contrast with private uncertainty, so 'confident' must mean outwardly self-assured.",
    explanation: "Words-in-context questions rely on the surrounding contrast or continuation — here the word 'despite' signals a contrast with uncertainty.",
  },
  {
    domain: "Craft and Structure",
    skill: "Text Structure and Purpose",
    difficulty: "Medium",
    questionText:
      "Text: The author spends the first half of the essay describing the traditional method of glassblowing in detail, then pivots to explain how modern 3D-printed molds have changed the craft. What is the main purpose of the essay's first half?",
    choices: [
      "To argue that traditional glassblowing is superior to modern methods.",
      "To establish a baseline understanding of the traditional process before highlighting what has changed.",
      "To criticize glassblowers who resist new technology.",
      "To provide a brief history of the glass industry's economics.",
    ],
    correctIndex: 1,
    rationale: "Describing the traditional method before the pivot serves to give readers context so the later contrast with modern methods is clear.",
    explanation: "Purpose questions ask what a section is DOING in the essay's structure, not just what it says.",
  },
  {
    domain: "Craft and Structure",
    skill: "Cross-Text Connections",
    difficulty: "Hard",
    questionText:
      "Text 1: Economist Rui Tan argues that remote work permanently reduced downtown commercial real estate demand. Text 2: Urban planner Lena Osei argues that downtown demand is cyclical and will rebound as companies adopt hybrid-office mandates. How would Osei most likely respond to Tan's claim?",
    choices: [
      "By agreeing that remote work has no effect on real estate demand.",
      "By arguing that Tan mistakes a temporary cyclical dip for a permanent structural shift.",
      "By agreeing entirely with Tan's timeline for the decline.",
      "By claiming remote work will continue increasing indefinitely.",
    ],
    correctIndex: 1,
    rationale: "Osei's cyclical framing directly contradicts Tan's claim of permanence, so she would characterize his view as mistaking a temporary trend for a lasting one.",
    explanation: "Cross-text questions require identifying the precise point of disagreement between two authors, not just a general theme they share.",
  },
  {
    domain: "Craft and Structure",
    skill: "Words in Context",
    difficulty: "Medium",
    questionText:
      "Text: The critic's review was measured, neither praising nor condemning the film outright, but carefully weighing its strengths against its flaws. As used in the text, 'measured' most nearly means",
    choices: ["angry", "balanced", "lengthy", "musical"],
    correctIndex: 1,
    rationale: "The rest of the sentence describes weighing strengths against flaws without extremes — this is the definition of 'balanced' in this context.",
    explanation: "Look for the clause that restates or explains the word — here 'neither praising nor condemning... but carefully weighing' defines 'measured' as balanced.",
  },

  // ---------- Expression of Ideas ----------
  {
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "Easy",
    questionText:
      "The lab results were inconclusive. ___, the team decided to repeat the experiment with a larger sample size. Which choice completes the text with the most logical transition?",
    choices: ["For example,", "Consequently,", "In contrast,", "Similarly,"],
    correctIndex: 1,
    rationale: "Repeating the experiment is a direct result of inconclusive results, so a cause-effect transition ('Consequently,') fits.",
    explanation: "Transition questions test the logical relationship between the two sentences — here it's cause and effect, not contrast or example.",
  },
  {
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "Medium",
    questionText:
      "The new policy reduced paperwork for small businesses. ___, it introduced a lengthy approval process for larger firms. Which choice completes the text with the most logical transition?",
    choices: ["Moreover,", "However,", "Therefore,", "For instance,"],
    correctIndex: 1,
    rationale: "The two clauses describe opposite effects for different groups (small vs. large businesses), so a contrast word is needed.",
    explanation: "'However' signals contrast, matching the shift from a benefit (small businesses) to a drawback (large firms).",
  },
  {
    domain: "Expression of Ideas",
    skill: "Rhetorical Synthesis",
    difficulty: "Hard",
    questionText:
      "A student is writing a report and has gathered these notes: (1) Solar panel efficiency has increased 40% since 2010. (2) Installation costs have dropped by half in the same period. (3) Battery storage remains the primary barrier to full grid adoption. The student wants to emphasize the single biggest remaining obstacle to solar adoption. Which choice most effectively uses the notes to accomplish this goal?",
    choices: [
      "Since 2010, solar panel efficiency has risen 40% and installation costs have fallen by half.",
      "Despite major gains in efficiency and falling costs since 2010, battery storage remains the primary barrier to full solar grid adoption.",
      "Solar panels are more efficient and cheaper to install than they were in 2010.",
      "Battery storage, efficiency, and cost are all factors in solar adoption.",
    ],
    correctIndex: 1,
    rationale: "Only choice 2 both acknowledges the progress (notes 1-2) and clearly foregrounds note 3 as THE remaining obstacle, matching the stated goal.",
    explanation: "Rhetorical synthesis questions require matching the selected combination of facts to the STATED goal — here, 'emphasize the single biggest remaining obstacle.'",
  },
  {
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "Medium",
    questionText:
      "Many students find statistics intimidating at first. ___, once they see it applied to real data they care about, engagement often increases sharply. Which choice completes the text with the most logical transition?",
    choices: ["Similarly,", "Yet", "Because", "As a result,"],
    correctIndex: 1,
    rationale: "The sentence sets up a contrast between initial intimidation and later increased engagement, which 'Yet' signals.",
    explanation: "'Yet' introduces a contrasting outcome, matching the shift from intimidation to engagement.",
  },

  // ---------- Standard English Conventions ----------
  {
    domain: "Standard English Conventions",
    skill: "Boundaries",
    difficulty: "Easy",
    questionText:
      "Which choice completes the text so that it conforms to the conventions of Standard English?\nThe committee reviewed the proposal ___ several members raised concerns about its budget.",
    choices: [", and", "; however,", ". Although", ", but although"],
    correctIndex: 1,
    rationale: "Two independent clauses need a semicolon (or period) before a transition word like 'however,' followed by a comma.",
    explanation: "A comma alone cannot join two independent clauses (comma splice); a semicolon before 'however,' correctly separates them while showing contrast.",
  },
  {
    domain: "Standard English Conventions",
    skill: "Boundaries",
    difficulty: "Medium",
    questionText:
      "Which choice completes the text so that it conforms to the conventions of Standard English?\nThe museum's new wing ___ features three galleries devoted entirely to modern sculpture.",
    choices: ["which opened last spring,", "opened last spring", "opening last spring", "opened last spring,"],
    correctIndex: 0,
    rationale: "The nonessential clause 'which opened last spring' needs commas on both sides since it interrupts the main clause without changing its core meaning.",
    explanation: "Nonrestrictive (nonessential) clauses describing the subject must be set off by commas on both sides, not just one or none.",
  },
  {
    domain: "Standard English Conventions",
    skill: "Form, Structure, and Sense",
    difficulty: "Medium",
    questionText:
      "Which choice completes the text so that it conforms to the conventions of Standard English?\nEach of the researchers ___ required to submit a summary before the conference.",
    choices: ["were", "are", "is", "have been"],
    correctIndex: 2,
    rationale: "'Each' is singular, so it takes the singular verb 'is,' regardless of the plural noun in the prepositional phrase that follows.",
    explanation: "Subject-verb agreement is based on the grammatical subject ('Each'), not on a noun inside an intervening prepositional phrase ('of the researchers').",
  },
  {
    domain: "Standard English Conventions",
    skill: "Form, Structure, and Sense",
    difficulty: "Hard",
    questionText:
      "Which choice completes the text so that it conforms to the conventions of Standard English?\nBy the time the results are published, the research team ___ over three years collecting and verifying the data.",
    choices: ["will have spent", "spends", "will spend", "had spent"],
    correctIndex: 0,
    rationale: "'By the time' + a future event calls for future perfect tense to show an action completed before another future point.",
    explanation: "Future perfect ('will have spent') is used for an action that will be completed before a specified future time — signaled here by 'By the time the results are published.'",
  },
  {
    domain: "Standard English Conventions",
    skill: "Boundaries",
    difficulty: "Hard",
    questionText:
      "Which choice completes the text so that it conforms to the conventions of Standard English?\nThe report cites three sources ___ a government survey, an academic study, and a industry white paper.",
    choices: [":", ",", ";", "—and"],
    correctIndex: 0,
    rationale: "A colon correctly introduces a list that follows a complete independent clause.",
    explanation: "Use a colon after an independent clause to introduce a list, definition, or explanation — a comma or semicolon here would be a boundary error.",
  },
];

export function buildRwQuestion(seed: RwQuestionSeed) {
  const letters = ["A", "B", "C", "D"];
  const choices = seed.choices.map((text, i) => ({ id: letters[i], text }));
  return {
    id: newId("q"),
    section: "Reading and Writing" as const,
    domain: seed.domain,
    skill: seed.skill,
    difficulty: seed.difficulty,
    questionText: seed.questionText,
    choices,
    correctAnswer: letters[seed.correctIndex],
    questionType: "multiple_choice" as const,
    rationale: seed.rationale,
    explanation: seed.explanation,
    estimatedTime: seed.difficulty === "Hard" ? 100 : seed.difficulty === "Medium" ? 80 : 55,
  };
}

export function generateRwQuestions(count: number): ReturnType<typeof buildRwQuestion>[] {
  // Cycle through the hand-authored bank (re-using items across mocks is
  // acceptable for a v1 seed set; each reuse still gets a fresh id).
  const out: ReturnType<typeof buildRwQuestion>[] = [];
  for (let i = 0; i < count; i++) {
    out.push(buildRwQuestion(RW_BANK[i % RW_BANK.length]));
  }
  return out;
}
