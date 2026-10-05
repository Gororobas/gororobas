/** Rejection stays a value until the physical owner commits its accounting. */
export type ConsumeDecision<A> =
  | { readonly _tag: "accepted"; readonly value: A }
  | { readonly _tag: "rejected" };
