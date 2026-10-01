import { cookies } from "next/headers";
import { LANG_COOKIE, langValue, type Lang } from "./dict";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return langValue(store.get(LANG_COOKIE)?.value);
}

export async function getCookie(name: string): Promise<string | undefined> {
  const store = await cookies();
  return store.get(name)?.value;
}