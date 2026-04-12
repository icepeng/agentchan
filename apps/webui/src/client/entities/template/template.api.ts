import { json } from "@/client/shared/api.js";
import type { TemplateMeta } from "./template.types.js";

export function fetchTemplates(): Promise<TemplateMeta[]> {
  return json("/templates");
}
