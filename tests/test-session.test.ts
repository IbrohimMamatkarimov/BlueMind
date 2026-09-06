import assert from "node:assert/strict";
import test from "node:test";
import { FULL_EXAM_STEPS, formatTime, fullExamAvailable, isTestMode, remainingSeconds } from "../src/lib/test-session";

test("a full paper requires exactly 27/27 reading and 22/22 math questions", () => {
  const complete = {
    math: [{ module: 1, questionCount: 22 }, { module: 2, questionCount: 22 }],
    readingWriting: [{ module: 1, questionCount: 27 }, { module: 2, questionCount: 27 }],
  };
  assert.equal(fullExamAvailable(complete), true);
  // Older cached library responses may contain Postgres bigint strings.
  const legacy = JSON.parse(JSON.stringify(complete).replaceAll('"questionCount":22', '"questionCount":"22"').replaceAll('"questionCount":27', '"questionCount":"27"'));
  assert.equal(fullExamAvailable(legacy), true);
  assert.equal(fullExamAvailable({ ...complete, math: complete.math.slice(0, 1) }), false);
  assert.equal(fullExamAvailable({ ...complete, math: [{ module: 1, questionCount: 22 }, { module: 1, questionCount: 22 }] }), false);
  for (const questionCount of [0, 1, 21, 23]) {
    assert.equal(fullExamAvailable({ ...complete, math: [{ module: 1, questionCount }, complete.math[1]] }), false);
  }
  assert.equal(fullExamAvailable({ ...complete, readingWriting: [{ module: 1, questionCount: 27 }, { module: 2, questionCount: 0 }] }), false);
});

test("the exam has the official section order and a single 10-minute break", () => {
  assert.deepEqual(FULL_EXAM_STEPS.map(step => [step.section, step.module, step.minutes]), [
    ["Reading and Writing", 1, 32], ["Reading and Writing", 2, 32], ["Break", 0, 10], ["Math", 1, 35], ["Math", 2, 35],
  ]);
  assert.equal(FULL_EXAM_STEPS.reduce((minutes, step) => minutes + step.minutes, 0), 144);
});

test("countdown follows elapsed time even after delayed browser callbacks", () => {
  assert.equal(remainingSeconds(600_000, 0), 600);
  assert.equal(remainingSeconds(600_000, 550_500), 50);
  assert.equal(remainingSeconds(600_000, 599_999), 1);
  assert.equal(remainingSeconds(600_000, 600_000), 0);
  assert.equal(remainingSeconds(600_000, 900_000), 0);
  assert.equal(formatTime(600), "10:00");
  assert.equal(formatTime(0), "0:00");
});

test("only supported modes can be restored", () => {
  for (const mode of ["timed", "untimed", "exam"]) assert.equal(isTestMode(mode), true);
  for (const mode of [null, undefined, "practice", "", {}, 0]) assert.equal(isTestMode(mode), false);
});
