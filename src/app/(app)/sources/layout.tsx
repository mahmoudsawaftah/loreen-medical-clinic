import guardChildren from "@/components/route-guard";
import { ROUTE_GUARDS } from "@/lib/navigation";

export default async function Layout({ children }: { children: React.ReactNode }) {
  return guardChildren(children, ROUTE_GUARDS["/sources"]);
}
