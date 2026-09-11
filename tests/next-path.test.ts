import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../src/lib/next-path";

test("same-site paths are kept so a shared question link survives sign-in", () => {
  assert.equal(safeNextPath("/q/q_ru2par2DodpAEO1Z"), "/q/q_ru2par2DodpAEO1Z");
  assert.equal(safeNextPath("/practice/browse?section=Math"), "/practice/browse?section=Math");
});

test("anything that could leave the site is refused", () => {
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(""), null);
  assert.equal(safeNextPath("https://evil.example/"), null);
  assert.equal(safeNextPath("//evil.example/"), null);
  assert.equal(safeNextPath("/\\evil.example/"), null);
  assert.equal(safeNextPath("/ok\\..\\evil"), null);
  assert.equal(safeNextPath("/line\nbreak"), null);
  assert.equal(safeNextPath("javascript:alert(1)"), null);
  assert.equal(safeNextPath("/" + "a".repeat(600)), null);
});
