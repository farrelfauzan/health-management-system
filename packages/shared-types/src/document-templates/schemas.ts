import { z } from 'zod';

import {
  INVOICE_ITEM_COLUMN_TOKENS,
  TEMPLATE_VARIABLE_KINDS,
} from '#document-templates/template-variables';

/**
 * OQ-2 resolved: no thermal-roll sizes. Clinics print on lightweight sheet
 * stock, so the three sheet sizes the printer tray actually holds are the
 * whole requirement (`P16-T05`).
 */
export const PAPER_SIZES = ['A4', 'A5', 'LETTER'] as const;

export const paperSizeSchema = z.enum(PAPER_SIZES);

export type PaperSizeValue = z.infer<typeof paperSizeSchema>;

export const PAGE_ORIENTATIONS = ['PORTRAIT', 'LANDSCAPE'] as const;

export const pageOrientationSchema = z.enum(PAGE_ORIENTATIONS);

export type PageOrientationValue = z.infer<typeof pageOrientationSchema>;

/**
 * A template moves DRAFT → PUBLISHED when its first immutable version is cut,
 * and ARCHIVED when it is retired. ARCHIVED is terminal for the working copy
 * only — published versions stay forever, because rendered documents point at
 * them.
 */
export const DOCUMENT_TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export const documentTemplateStatusSchema = z.enum(DOCUMENT_TEMPLATE_STATUSES);

export type DocumentTemplateStatusValue = z.infer<typeof documentTemplateStatusSchema>;

/**
 * The template kind reuses the variable-registry kinds on purpose: a template
 * of kind X is authored against registry X, and a kind with no registry would
 * be a layout nothing can fill.
 */
export const documentTemplateKindSchema = z.enum(TEMPLATE_VARIABLE_KINDS);

export type DocumentTemplateKindValue = z.infer<typeof documentTemplateKindSchema>;

const MAX_TEMPLATE_NAME_LENGTH = 120;

const MAX_TEMPLATE_DESCRIPTION_LENGTH = 500;

/**
 * 200k characters ≈ 200 KB of layout HTML — an order of magnitude above any
 * real invoice template, and small enough that the sanitiser and the renderer
 * never chew through megabytes someone pasted in by mistake.
 */
export const MAX_TEMPLATE_CONTENT_HTML_LENGTH = 200_000;

const MAX_PAGE_MARGIN_MM = 50;

const DEFAULT_PAGE_MARGIN_MM = 10;

const pageMarginMmSchema = z.number().min(0).max(MAX_PAGE_MARGIN_MM);

export const invoiceItemColumnTokenSchema = z.enum(INVOICE_ITEM_COLUMN_TOKENS);

/**
 * The repeating-block column config (`P16-T11`, FR-E1-04): which `item.*`
 * columns the `items` block renders and in which order. Lives in `settings`
 * rather than on the `<div data-hms-var="items">` element because the
 * sanitiser strips every attribute but the token from a chip. Defaults to
 * the full built-in column set so a template saved before this field existed
 * keeps rendering the table it always rendered.
 */
export const itemsColumnsSchema = z
  .array(invoiceItemColumnTokenSchema)
  .min(1)
  .max(INVOICE_ITEM_COLUMN_TOKENS.length)
  .refine((columns) => new Set(columns).size === columns.length, {
    message: 'Each item column may appear at most once',
  });

/**
 * Layout settings snapshotted with every published version. Strict (not
 * passthrough) so an unknown key is a validation error today rather than a
 * silently ignored one that a later release starts honouring.
 */
export const templateSettingsSchema = z
  .object({
    paperSize: paperSizeSchema.default('A4'),
    orientation: pageOrientationSchema.default('PORTRAIT'),
    marginMm: z
      .object({
        top: pageMarginMmSchema.default(DEFAULT_PAGE_MARGIN_MM),
        right: pageMarginMmSchema.default(DEFAULT_PAGE_MARGIN_MM),
        bottom: pageMarginMmSchema.default(DEFAULT_PAGE_MARGIN_MM),
        left: pageMarginMmSchema.default(DEFAULT_PAGE_MARGIN_MM),
      })
      .strict()
      .default({}),
    itemsColumns: itemsColumnsSchema.default([...INVOICE_ITEM_COLUMN_TOKENS]),
  })
  .strict();

export type TemplateSettingsValue = z.infer<typeof templateSettingsSchema>;

export function resolveDefaultTemplateSettings(): TemplateSettingsValue {
  return templateSettingsSchema.parse({});
}

/**
 * `contentHtml` may be empty on create — a template starts as a blank page in
 * the editor — but publish refuses an empty layout, because a published
 * version is what real invoices render from.
 */
export const createDocumentTemplateSchema = z.object({
  kind: documentTemplateKindSchema,
  name: z.string().trim().min(1).max(MAX_TEMPLATE_NAME_LENGTH),
  description: z.string().trim().min(1).max(MAX_TEMPLATE_DESCRIPTION_LENGTH).optional(),
  contentHtml: z.string().max(MAX_TEMPLATE_CONTENT_HTML_LENGTH).default(''),
  settings: templateSettingsSchema.default({}),
});

export const updateDocumentTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TEMPLATE_NAME_LENGTH).optional(),
    description: z
      .string()
      .trim()
      .min(1)
      .max(MAX_TEMPLATE_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    contentHtml: z.string().max(MAX_TEMPLATE_CONTENT_HTML_LENGTH).optional(),
    settings: templateSettingsSchema.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

/**
 * `kind` is required rather than defaulted for the same reason the variables
 * route requires it: the second document kind will make a silent default the
 * wrong answer for whoever forgot to pass one.
 */
export const listDocumentTemplatesQuerySchema = z.object({
  kind: documentTemplateKindSchema,
});

export const templateVariableKindSchema = documentTemplateKindSchema;

/**
 * Which registry the palette is asking for. Required rather than defaulted to
 * `INVOICE`: the second document kind (`E2`) will make a silent default the
 * wrong answer for whoever forgot to pass one.
 */
export const listTemplateVariablesQuerySchema = z.object({
  kind: templateVariableKindSchema,
});

export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;
export type UpdateDocumentTemplateInput = z.infer<typeof updateDocumentTemplateSchema>;
export type ListDocumentTemplatesQueryInput = z.infer<typeof listDocumentTemplatesQuerySchema>;
export type ListTemplateVariablesQueryInput = z.infer<typeof listTemplateVariablesQuerySchema>;

/**
 * Publish-time validation (`P16-T12`): a draft referencing a token outside
 * the registry is refused with this code and the offending tokens listed in
 * `error.details`, so the author sees the typo in the editor rather than as
 * an empty field on a patient's receipt.
 */
export const DOCUMENT_TEMPLATE_UNKNOWN_TOKENS_ERROR_CODE = 'DOCUMENT_TEMPLATE_UNKNOWN_TOKENS';

export const documentTemplatePublishValidationDetailsSchema = z.object({
  unknownTokens: z.array(z.string()).min(1),
});

export type DocumentTemplatePublishValidationDetails = z.infer<
  typeof documentTemplatePublishValidationDetailsSchema
>;

/**
 * Template import from Word (`P16-T42`). One type, one cap: a `.docx` is a
 * ZIP of XML and a few images, and 5 MiB is generous for a receipt layout
 * with a letterhead in it. Declared here, next to the surface's schemas, as
 * `docs/security/file-uploads.md` requires of every upload surface.
 */
export const DOCUMENT_TEMPLATE_IMPORT_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const DOCUMENT_TEMPLATE_IMPORT_MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const createDocumentTemplateImportUploadUrlSchema = z.object({
  sizeBytes: z.number().int().positive().max(DOCUMENT_TEMPLATE_IMPORT_MAX_UPLOAD_SIZE_BYTES),
});

export type CreateDocumentTemplateImportUploadUrlInput = z.infer<
  typeof createDocumentTemplateImportUploadUrlSchema
>;

/** The staged key the signing call returned, and nothing else — the API decides what it is. */
export const importDocumentTemplateSchema = z.object({
  stagedKey: z.string().trim().min(1).max(512),
});

export type ImportDocumentTemplateInput = z.infer<typeof importDocumentTemplateSchema>;

/**
 * What an import could not carry over. The author sees these beside the
 * editor before saving; `UNKNOWN_PLACEHOLDER` is the one publish would
 * otherwise catch later (`P16-T12`), surfaced early.
 */
export const DOCUMENT_TEMPLATE_IMPORT_WARNING_CODES = [
  'UNKNOWN_PLACEHOLDER',
  'IMAGE_DROPPED',
  'UNSUPPORTED_CONTENT',
] as const;

export type DocumentTemplateImportWarningCode =
  (typeof DOCUMENT_TEMPLATE_IMPORT_WARNING_CODES)[number];
