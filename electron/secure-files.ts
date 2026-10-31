import { open, realpath, rename, rm } from "node:fs/promises";
import { dirname, resolve, relative, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { SecurityError } from "../shared/security";
export async function readBounded(path: string, maximum: number) {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maximum)
      throw new SecurityError("BACKUP_INVALID");
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maximum) {
      const chunk = Buffer.alloc(Math.min(1024 * 1024, maximum + 1 - total));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
    }
    if (total > maximum) throw new SecurityError("BACKUP_INVALID");
    return Buffer.concat(chunks, total);
  } finally {
    await file.close();
  }
}
export async function externalDestination(path: string, root: string) {
  const parent = await realpath(dirname(resolve(path)));
  const canonical = resolve(parent, basename(path));
  const workspace = await realpath(root);
  const delta = relative(workspace, canonical);
  if (delta === "" || (!delta.startsWith("..") && !delta.includes(":")))
    throw new SecurityError("BACKUP_DESTINATION");
  return canonical;
}
export async function atomicPrivateFile(path: string, data: string | Buffer) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
