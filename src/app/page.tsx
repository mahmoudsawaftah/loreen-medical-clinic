import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/authorize";

export default async function HomePage() {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  redirect("/dashboard");
}