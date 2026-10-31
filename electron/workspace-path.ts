import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  lstatSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { join, resolve, relative } from "node:path";
export function activeWorkspace(root: string) {
  const pointer = join(root, "active-workspace.json");
  if (!existsSync(pointer)) return root;
  const value = JSON.parse(readFileSync(pointer, "utf8")) as {
    generation?: unknown;
  };
  if (
    typeof value.generation !== "string" ||
    !/^generation-[\da-f-]{36}$/.test(value.generation)
  )
    throw new Error("Invalid workspace pointer");
  const target = resolve(root, "recovery", value.generation);
  if (relative(resolve(root, "recovery"), target) !== value.generation)
    throw new Error("Unsafe workspace pointer");
  if (
    lstatSync(resolve(root, "recovery")).isSymbolicLink() ||
    lstatSync(target).isSymbolicLink()
  )
    throw new Error("Unsafe workspace link");
  return target;
}
export function activateWorkspace(root: string, generation: string) {
  if (!/^generation-[\da-f-]{36}$/.test(generation))
    throw new Error("Invalid generation");
  mkdirSync(root, { recursive: true });
  const target = join(root, "active-workspace.json"),
    temporary = join(root, "active-workspace.next.json");
  writeFileSync(temporary, JSON.stringify({ generation }), {
    mode: 0o600,
    flag: "w",
  });
  const descriptor = openSync(temporary, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, target);
}
