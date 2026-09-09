import * as React from "react"

const DEFAULT_REQUIRED_TEXT = "required"

type RequiredMarkerProps = Omit<React.ComponentProps<"span">, "children"> & {
  /**
   * Word a screen reader announces instead of the asterisk. English by
   * default; app code passes the translated word for the active locale.
   */
  requiredText?: string
}

/**
 * Red asterisk that marks a required field. The symbol itself is hidden from
 * assistive technology and a visually hidden word takes its place, so a screen
 * reader announces "required" exactly once and never reads the asterisk.
 * `Label` renders it through its `required` prop; use it directly only for a
 * custom label that cannot go through `Label`.
 */
function RequiredMarker({
  className,
  requiredText = DEFAULT_REQUIRED_TEXT,
  ...props
}: RequiredMarkerProps) {
  return (
    <span data-slot="required-marker" className={className} {...props}>
      <span aria-hidden="true" className="text-destructive">
        *
      </span>
      <span className="sr-only"> {requiredText}</span>
    </span>
  )
}

export { RequiredMarker }
