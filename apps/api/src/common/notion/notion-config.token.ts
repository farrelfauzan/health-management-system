/**
 * Injection token for the resolved {@link NotionConfig}. A token rather than a
 * service class because the configuration is a frozen value read once at boot,
 * and injecting it by type would tempt callers to re-resolve it per request.
 */
export const NOTION_CONFIG = Symbol('NOTION_CONFIG');
