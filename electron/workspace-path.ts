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
  if (!existsSync(join(target, 'mosque-suite.sqlite3'))) throw new Error('Restored database is missing; automatic recreation is refused');
  return target;
}
export function checkedWorkspace(root: string) {
  const target = activeWorkspace(root);
  if (existsSync(join(root, 'workspace-established.json')) && !existsSync(join(target, 'mosque-suite.sqlite3'))) {
    throw new Error('Existing database is missing; restore a verified backup instead of recreating it');
  }
  return target;
}
export function markWorkspaceEstablished(root: string) {
  const marker = join(root, 'workspace-established.json');
  if (!existsSync(marker)) {
    const descriptor = openSync(marker, 'wx', 0o600);
    try { writeFileSync(descriptor, JSON.stringify({ established: true })); fsyncSync(descriptor); }
    finally { closeSync(descriptor); }
  }
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
