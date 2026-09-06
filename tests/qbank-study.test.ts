import assert from "node:assert/strict";
import test from "node:test";
import { countMatchingQuestions } from "../src/lib/qbank-selection";
import { availableTestModes } from "../src/lib/test-session";

test("a Question Bank category session uses every matching question", () => {
  const rows = [
    { section: "Reading and Writing", skill: "Inferences", easy: 40, medium: 55, hard: 45 },
    { section: "Reading and Writing", skill: "Transitions", easy: 20, medium: 20, hard: 20 },
    { section: "Math", skill: "Inferences", easy: 100, medium: 100, hard: 100 },
  ];
  assert.equal(countMatchingQuestions(rows, "Reading and Writing", ["Inferences"], ["Easy", "Medium", "Hard"]), 140);
  assert.equal(countMatchingQuestions(rows, "Reading and Writing", ["Inferences"], ["Hard"]), 45);
  assert.equal(countMatchingQuestions(rows, "Reading and Writing", ["Inferences"], []), 140);
});

test("Question Bank study setup never offers real exam environment", () => {
  const modes = availableTestModes(["untimed", "timed"]);
  assert.deepEqual(modes.map((mode) => mode.value), ["untimed", "timed"]);
  assert.equal(modes.some((mode) => mode.value === "exam"), false);
});
