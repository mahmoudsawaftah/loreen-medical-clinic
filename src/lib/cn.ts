export function cn(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ") || undefined;
}

export function cx(...inputs: (string | false | null | undefined)[]) {
  return inputs.filter(Boolean).join(" ");
}