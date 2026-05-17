import { json } from "@/client/platform/index.js";
import type { UpdateStatus } from "./update.types.js";

export function fetchUpdateStatus(force = false): Promise<UpdateStatus> {
  return json(`/update${force ? "?force=1" : ""}`);
}
