import { json } from "@/client/shared/api.js";
import type { UpdateStatus } from "./update.types.js";

export function fetchUpdateStatus(force = false): Promise<UpdateStatus> {
  return json(`/update${force ? "?force=1" : ""}`);
}
