/** "Ada Lovelace" → "AL", "ada" → "AD". */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return (words[0] ?? "").slice(0, 2).toUpperCase();
  }
  return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
};
