"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Per-type classes keep every toast on the dashboard palette: card background,
 * a tone accent on the leading edge, and the tone colour on icon and title.
 * Statement tones (error, warning) also set the title bold so a refusal or a
 * blocking condition can never be mistaken for info text. The `!` modifiers are
 * needed because sonner's own stylesheet targets `[data-sonner-toast][data-styled]`
 * with higher specificity than a single utility class.
 */
const STATEMENT_TITLE = "[&_[data-title]]:font-semibold!"

const toastOptions: ToasterProps["toastOptions"] = {
  classNames: {
    title: "font-heading",
    description: "text-muted-foreground!",
    success:
      "border-l-4! border-l-success! [&_[data-icon]]:text-success [&_[data-title]]:text-success-emphasis!",
    info: "border-l-4! border-l-info! [&_[data-icon]]:text-info [&_[data-title]]:text-info!",
    warning: `border-l-4! border-l-warning! [&_[data-icon]]:text-warning [&_[data-title]]:text-warning-emphasis! ${STATEMENT_TITLE}`,
    error: `border-l-4! border-l-destructive! [&_[data-icon]]:text-destructive [&_[data-title]]:text-destructive! ${STATEMENT_TITLE}`,
  },
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={toastOptions}
      {...props}
    />
  )
}

export { Toaster }
