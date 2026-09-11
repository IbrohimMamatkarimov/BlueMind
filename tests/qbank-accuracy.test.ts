import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_ACCURACY,
  accuracyPalette,
  accuracyPercent,
  describeAccuracy,
  isSolved,
  recordAttempt,
} from "../src/lib/qbank-accuracy";

test("a missed question is red, one make after it turns amber, more makes turn green", () => {
  let stats = recordAttempt(EMPTY_ACCURACY, false);
  assert.equal(accuracyPercent(stats), 0);
  assert.equal(accuracyPalette(stats)?.background, "#c13515");

  stats = recordAttempt(stats, true);
  assert.equal(accuracyPercent(stats), 50);
  assert.equal(accuracyPalette(stats)?.background, "#d99e06");

  stats = recordAttempt(recordAttempt(stats, true), true);
  assert.equal(accuracyPercent(stats), 75);
  const threeOfFour = accuracyPalette(stats)!;
  assert.notEqual(threeOfFour.background, "#d99e06");
  assert.notEqual(threeOfFour.background, "#15803d");

  const perfect = accuracyPalette({ attempts: 5, correct: 5 })!;
  assert.equal(perfect.background, "#15803d");
  assert.equal(perfect.foreground, "#ffffff");
});

test("a later mistake pulls the colour back toward red proportionally", () => {
  const before = accuracyPalette({ attempts: 4, correct: 4 })!;
  const after = accuracyPalette({ attempts: 5, correct: 4 })!;
  assert.equal(after.percent, 80);
  assert.notEqual(after.background, before.background);
  // the fill carries more red than the perfect-record green did
  assert.ok(parseInt(after.background.slice(1, 3), 16) > parseInt(before.background.slice(1, 3), 16));
});

test("unattempted questions keep the plain style and readable text is chosen on the amber middle", () => {
  assert.equal(accuracyPalette(EMPTY_ACCURACY), null);
  assert.equal(accuracyPercent(EMPTY_ACCURACY), null);
  assert.equal(accuracyPalette({ attempts: 2, correct: 1 })?.foreground, "#1e1e1e");
  assert.equal(accuracyPalette({ attempts: 1, correct: 0 })?.foreground, "#ffffff");
});

test("solved means the latest attempt was correct, and the description reads naturally", () => {
  assert.equal(isSolved(EMPTY_ACCURACY), false);
  assert.equal(isSolved(recordAttempt(EMPTY_ACCURACY, false)), false);
  assert.equal(isSolved(recordAttempt(recordAttempt(EMPTY_ACCURACY, false), true)), true);
  assert.equal(isSolved(recordAttempt(recordAttempt(EMPTY_ACCURACY, true), false)), false);
  assert.equal(describeAccuracy({ attempts: 4, correct: 3 }), "3 of 4 correct · 75%");
  assert.equal(describeAccuracy(EMPTY_ACCURACY), "not attempted yet");
  assert.equal(recordAttempt({ attempts: 2, correct: 1, lastCorrect: false, sessionAttempts: 1 }, true).sessionAttempts, 2);
});
