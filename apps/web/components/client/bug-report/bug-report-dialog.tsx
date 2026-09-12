'use client';

import { useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import {
  cleanBugReportPagePath,
  detectSensitiveData,
  SensitiveDataFinding,
} from '@hms/shared-types';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AutomaticDetailsNotice } from '#components/client/bug-report/automatic-details-notice';
import { SensitiveDataBanner } from '#components/client/bug-report/sensitive-data-banner';
import { SensitiveDataFindings } from '#components/client/bug-report/sensitive-data-findings';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { readFailedRequestIds } from '#lib/api/failed-request-buffer';
import { notifyApiError } from '#lib/api/notify-api-error';
import { submitBugReport } from '#lib/bug-report/submit-bug-report';

type BugReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type BugReportFormValues = {
  title: string;
  description: string;
  stepsToReproduce: string;
  expected: string;
};

/** The form fields, and which schema field each one is checked as. */
const FORM_FIELDS: ReadonlyArray<{ name: keyof BugReportFormValues; isMultiline: boolean }> = [
  { name: 'title', isMultiline: false },
  { name: 'description', isMultiline: true },
  { name: 'stepsToReproduce', isMultiline: true },
  { name: 'expected', isMultiline: true },
];

/**
 * Where reporting starts (P23-T11).
 *
 * The dialog's job is not to collect a report — it is to stop one kind of report
 * being sent at all. A bug is described while something is going wrong on a
 * screen with a patient on it, so the reporter is warned in words, made to tick
 * a box, and blocked while any field still looks like it carries an identifier.
 * There is deliberately **no "send anyway"**.
 *
 * None of that is the control. `detectSensitiveData` runs here as a courtesy —
 * anyone with developer tools can defeat it — and the API runs the identical
 * function on the same text, which is what actually enforces it (P23-T08). The
 * browser check exists so the reporter finds out while they are still typing,
 * not after a round trip.
 */
export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const t = useTranslations('authShell.bugReport');
  const pathname = usePathname();
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFieldError, setServerFieldError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [values, setValues] = useState<BugReportFormValues>({
    title: '',
    description: '',
    stepsToReproduce: '',
    expected: '',
  });
  // Cleaned here as well as on the server: the reporter is shown exactly what
  // will be sent, and a raw route in the notice would reassure them about the
  // wrong string.
  const pagePath = cleanBugReportPagePath(pathname ?? '/');
  const requestIds = useMemo(() => readFailedRequestIds(), [open]);

  /**
   * Findings per field, recomputed from the current values.
   *
   * Recomputed on render rather than debounced into state: the detector is a few
   * regular expressions over at most a few thousand characters, and a debounce
   * would mean the submit button's enabled state briefly disagrees with the
   * findings on screen — which is the one moment it must not.
   */
  const findingsByField = useMemo(() => {
    const entries = FORM_FIELDS.map(({ name }) => [name, detectSensitiveData(values[name])] as const);
    return Object.fromEntries(entries) as Record<keyof BugReportFormValues, SensitiveDataFinding[]>;
  }, [values]);
  const hasAnyFinding = Object.values(findingsByField).some((findings) => findings.length > 0);

  const submitMutation = useMutation({
    mutationFn: submitBugReport,
  });

  const form = useForm({
    defaultValues: values,
    onSubmit: async ({ value }) => {
      setFormError(null);
      setServerFieldError(null);
      try {
        const result = await submitMutation.mutateAsync({
          title: value.title.trim(),
          description: value.description.trim(),
          ...(value.stepsToReproduce.trim() === ''
            ? {}
            : { stepsToReproduce: value.stepsToReproduce.trim() }),
          ...(value.expected.trim() === '' ? {} : { expected: value.expected.trim() }),
          pagePath,
          requestIds,
          acknowledgedNoSensitiveData: true,
        });
        if (result.outcome === 'sensitive-data') {
          setServerFieldError({ field: result.error.field, message: result.error.message });
          return;
        }
        toast.success(t('submitted', { reference: result.submission.reference }));
        resetDialog();
        onOpenChange(false);
      } catch (error) {
        setFormError(notifyApiError(error, t('submitFailed')));
      }
    },
  });

  function resetDialog(): void {
    setValues({ title: '', description: '', stepsToReproduce: '', expected: '' });
    setHasAcknowledged(false);
    setServerFieldError(null);
    form.reset();
  }

  function updateValue(name: keyof BugReportFormValues, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
    // Clearing the server error on edit is the point of showing it on a field:
    // it says "this box", and the reporter has just changed that box.
    setServerFieldError((current) => (current?.field === name ? null : current));
  }

  function selectFinding(name: keyof BugReportFormValues, finding: SensitiveDataFinding): void {
    const element = document.getElementById(`bug-report-${name}`);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.focus();
      element.setSelectionRange(finding.start, finding.end);
    }
  }

  const isSubmitDisabled =
    !hasAcknowledged ||
    hasAnyFinding ||
    submitMutation.isPending ||
    values.title.trim() === '' ||
    values.description.trim() === '';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetDialog();
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <SensitiveDataBanner />
          {FORM_FIELDS.map(({ name, isMultiline }) => (
            <div key={name} className="space-y-1">
              <Label htmlFor={`bug-report-${name}`}>{t(`fields.${name}`)}</Label>
              {isMultiline ? (
                <Textarea
                  id={`bug-report-${name}`}
                  rows={name === 'description' ? 4 : 2}
                  value={values[name]}
                  onChange={(event) => updateValue(name, event.target.value)}
                />
              ) : (
                <Input
                  id={`bug-report-${name}`}
                  value={values[name]}
                  onChange={(event) => updateValue(name, event.target.value)}
                />
              )}
              <SensitiveDataFindings
                findings={findingsByField[name]}
                onSelectFinding={(finding) => selectFinding(name, finding)}
              />
              {serverFieldError?.field === name ? (
                <p className="text-xs text-rose-600">{serverFieldError.message}</p>
              ) : null}
            </div>
          ))}
          <AutomaticDetailsNotice pagePath={pagePath} requestIdCount={requestIds.length} />
          <div className="flex items-start gap-2">
            <Checkbox
              id="bug-report-acknowledge"
              checked={hasAcknowledged}
              onCheckedChange={(checked) => setHasAcknowledged(checked === true)}
            />
            <Label htmlFor="bug-report-acknowledge" className="text-sm font-normal leading-snug">
              {t('acknowledge')}
            </Label>
          </div>
          {formError ? <InlineNotice tone="error">{formError}</InlineNotice> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {submitMutation.isPending ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
