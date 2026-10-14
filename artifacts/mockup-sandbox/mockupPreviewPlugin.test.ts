import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

async function invokeHook(hook: unknown, ...args: unknown[]) {
  const handler =
    typeof hook === "function"
      ? hook
      : (hook as { handler?: unknown } | undefined)?.handler;
  assert.equal(typeof handler, "function");
  return Reflect.apply(handler as (...args: unknown[]) => unknown, {}, args);
}

test("discovery tolerates an absent mockups directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-discovery-"));
  try {
    const plugin = mockupPreviewPlugin();
    await invokeHook(plugin.configResolved, { root });
    await invokeHook(plugin.buildStart);
    const generated = await readFile(
      path.join(root, "src/.generated/mockup-components.ts"),
      "utf8",
    );
    assert.match(generated, /export const modules: ModuleMap = \{\n\n\};/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery preserves public nested TSX imports and refreshes additions/removals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mockup-discovery-"));
  const mockups = path.join(root, "src/components/mockups");
  const generatedPath = path.join(root, "src/.generated/mockup-components.ts");
  async function addFile(file: string) {
    const target = path.join(mockups, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "export default function Preview() { return null; }");
  }
  try {
    for (const file of [
      "Top.tsx",
      "nested/Card.tsx",
      "_Private.tsx",
      "_private/Hidden.tsx",
      "nested/_private/Hidden.tsx",
      ".Hidden.tsx",
      ".hidden/Hidden.tsx",
      "nested/.hidden/Hidden.tsx",
      "notes.ts",
    ]) {
      await addFile(file);
    }
    // A directory ending in .tsx must not become an import.
    await mkdir(path.join(mockups, "Directory.tsx"));
    const plugin = mockupPreviewPlugin();
    await invokeHook(plugin.configResolved, { root });
    await invokeHook(plugin.buildStart);
    const source = await readFile(generatedPath, "utf8");
    assert.match(source, /"\.\/components\/mockups\/Top\.tsx": \(\) => import\("\.\.\/components\/mockups\/Top\.tsx"\)/);
    assert.match(source, /"\.\/components\/mockups\/nested\/Card\.tsx"/);
    assert.equal((source.match(/=> import/g) ?? []).length, 2);
    assert.doesNotMatch(source, /Hidden|Private|Directory|notes/);

    await addFile("Added.tsx");
    await rm(path.join(mockups, "Top.tsx"));
    await invokeHook(plugin.buildStart);
    const refreshed = await readFile(generatedPath, "utf8");
    assert.match(refreshed, /Added\.tsx/);
    assert.match(refreshed, /nested\/Card\.tsx/);
    assert.doesNotMatch(refreshed, /Top\.tsx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
