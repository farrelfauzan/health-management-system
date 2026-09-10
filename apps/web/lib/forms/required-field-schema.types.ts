/**
 * The slice of a Zod object schema the required-field helpers read. Declared
 * structurally so the web app does not take a direct `zod` dependency: any
 * `z.object(...)` from `@hms/shared-types` satisfies it.
 */
export type RequiredFieldSchema = {
  readonly shape: Readonly<Record<string, { isOptional(): boolean; isNullable(): boolean }>>;
};
