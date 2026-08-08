/**
 * Typed failures of the customer-service channel's tool layer (`PCS-T07`).
 *
 * A short closed set, and every value is something the *orchestration* must be
 * able to tell apart — never something a customer sees. Replies on this
 * channel come from templates and from the model; an error code's only
 * audience is the log and the tool-result turn in the transcript.
 */
export type CustomerServiceErrorCode =
  | 'CS_TOOL_UNKNOWN'
  | 'CS_TOOL_INVALID_ARGUMENTS'
  | 'CS_TOOL_RESULT_REJECTED'
  | 'CS_TOOL_EXECUTION_FAILED';

export class CustomerServiceError extends Error {
  constructor(
    readonly code: CustomerServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CustomerServiceError';
  }
}
