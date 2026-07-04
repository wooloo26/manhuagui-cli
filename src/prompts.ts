import { confirm, isCancel, multiselect, text } from "@clack/prompts";
import { CancelledError } from "./errors.js";
import type { Section } from "./types.js";

export function assertNotCanceled<T>(result: T | symbol): asserts result is T {
  if (isCancel(result)) {
    throw new CancelledError();
  }
}

export async function promptUrl(): Promise<string> {
  const result = await text({
    message: "Comic URL",
    placeholder: "https://www.manhuagui.com/comic/...",
    validate(value) {
      if (!value?.startsWith("https://www.manhuagui.com/comic/")) {
        return "Enter a valid manhuagui.com comic URL";
      }
    },
  });

  assertNotCanceled(result);
  return result;
}

export async function promptSections(sections: Section[]): Promise<Section[]> {
  if (sections.length === 0) {
    throw new Error("No sections found on the page. The website structure may have changed.");
  }

  const options = sections.map((s) => ({
    value: s.name,
    label: `${s.name} (${s.chapters.length} chapters)`,
  }));

  const selected = await multiselect({
    message: "Select sections to download",
    options,
    required: true,
  });

  assertNotCanceled(selected);
  return sections.filter((s) => selected.includes(s.name));
}

export async function promptConfirm(count: number): Promise<boolean> {
  const result = await confirm({
    message: `Download ${count} chapters?`,
    initialValue: true,
  });

  assertNotCanceled(result);
  return result;
}

export async function promptResume(done: number, total: number): Promise<boolean> {
  const result = await confirm({
    message: `Detected previous progress (${done}/${total} chapters done). Resume?`,
    initialValue: true,
  });

  assertNotCanceled(result);
  return result;
}

export async function promptOverwriteCheck(): Promise<boolean> {
  const result = await confirm({
    message: "Overwrite unfinished chapters? (completed chapters are safe)",
    initialValue: false,
  });

  assertNotCanceled(result);
  return result;
}
