/**
 * What the editor knows about one variable in the registry it is authoring
 * against: the machine token stored in the document and the human label the
 * chip shows for it. The label is presentation — it is looked up from this
 * list on every render and never written into the HTML (`P16-T11`).
 */
export type RichTextVariableDefinition = {
  readonly token: string;
  readonly label: string;
};
