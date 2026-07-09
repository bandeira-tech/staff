/** Prose from the trailing argument, or stdin when absent / `-`. */
export async function proseFrom(arg: string | undefined): Promise<string> {
  if (arg !== undefined && arg !== "-") return arg;
  const bytes = await new Response(Deno.stdin.readable).arrayBuffer();
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) throw new Error("no prose given (argument or stdin)");
  return text;
}
