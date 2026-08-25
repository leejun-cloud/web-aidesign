import { listTemplates } from "@/lib/design/templateStore";
import { TemplatesView } from "./TemplatesView";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  return <TemplatesView templates={await listTemplates()} />;
}
