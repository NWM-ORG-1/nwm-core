import { z } from "zod";

/**
 * Structured-output format for a zod schema, as the API's `output_config.format`.
 *
 * The SDK's `zodOutputFormat` moves `enum` into the description text, so the API
 * would accept any string for a label and the client-side parse would then fail
 * on a paid answer. This keeps `enum` and `const` (both supported) as real
 * constraints and moves only the unsupported keywords (lengths, ranges,
 * patterns) into the description as hints; zod still checks them on parse.
 * Works with `messages.parse` (it calls `parse`) and with `messages.create`.
 */

type JsonSchema = Record<string, unknown>;

const STRING_FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

export function strictJsonSchema(node: JsonSchema): JsonSchema {
  const rest: JsonSchema = { ...node };
  const take = (k: string) => {
    const v = rest[k];
    delete rest[k];
    return v;
  };
  const out: JsonSchema = {};
  take("$schema");
  take("additionalProperties");

  const defs = take("$defs") as Record<string, JsonSchema> | undefined;
  if (defs) out.$defs = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, strictJsonSchema(v)]));
  const ref = take("$ref");
  if (ref !== undefined) return { ...out, $ref: ref };

  const type = take("type");
  const anyOf = (take("anyOf") ?? take("oneOf")) as JsonSchema[] | undefined;
  const allOf = take("allOf") as JsonSchema[] | undefined;
  if (anyOf) out.anyOf = anyOf.map(strictJsonSchema);
  else if (allOf) out.allOf = allOf.map(strictJsonSchema);
  if (type !== undefined) out.type = type;

  for (const k of ["description", "title", "enum", "const"]) {
    const v = take(k);
    if (v !== undefined) out[k] = v;
  }

  if (type === "object") {
    const props = (take("properties") ?? {}) as Record<string, JsonSchema>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, strictJsonSchema(v)]));
    out.additionalProperties = false;
    const required = take("required");
    if (required !== undefined) out.required = required;
  } else if (type === "array") {
    const items = take("items") as JsonSchema | undefined;
    if (items) out.items = strictJsonSchema(items);
    const minItems = rest.minItems;
    if (minItems === 0 || minItems === 1) out.minItems = take("minItems");
  } else if (type === "string") {
    const format = rest.format;
    if (typeof format === "string" && STRING_FORMATS.has(format)) out.format = take("format");
  }

  // zod writes the safe-integer range on every int — not worth a hint
  if (rest.minimum === Number.MIN_SAFE_INTEGER) delete rest.minimum;
  if (rest.maximum === Number.MAX_SAFE_INTEGER) delete rest.maximum;

  // whatever the API cannot enforce stays visible to the model as a hint
  const hints = Object.entries(rest).filter(([, v]) => v !== undefined);
  if (hints.length) {
    const note = `{${hints.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")}}`;
    out.description = out.description ? `${out.description}\n\n${note}` : note;
  }
  return out;
}

export interface OutputFormat<T> {
  type: "json_schema";
  schema: JsonSchema;
  parse(text: string): T;
}

export function outputFormat<S extends z.ZodType>(schema: S): OutputFormat<z.infer<S>> {
  return {
    type: "json_schema",
    schema: strictJsonSchema(z.toJSONSchema(schema, { reused: "inline" }) as JsonSchema),
    parse(text: string): z.infer<S> {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (e) {
        throw new Error(`JSON이 아닙니다: ${(e as Error).message}`);
      }
      const r = schema.safeParse(raw);
      if (!r.success) {
        throw new Error(
          r.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; "),
        );
      }
      return r.data;
    },
  };
}
