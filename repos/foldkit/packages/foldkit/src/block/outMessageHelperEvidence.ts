declare const OutMessageHelperEvidenceTypeId: unique symbol

/** @internal Retains the exact child OutMessage contract of an authored helper. */
export interface OutMessageHelperEvidence<
  ChildOutMessage,
  Role extends 'fold' | 'forward',
> {
  readonly [OutMessageHelperEvidenceTypeId]: Readonly<{
    input: (outMessage: ChildOutMessage) => void
    output: ChildOutMessage
    role: Role
  }>
}
