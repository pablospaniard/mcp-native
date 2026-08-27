/**
 * Pure authorization decisions for the Codex review gate.
 * Kept free of GitHub client calls so failure paths can be unit-tested.
 */

export const APPROVAL_LABEL = "codex-review-approved";
export const STATUS_CONTEXT = "codex-review";

const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * @typedef {'skip-draft' | 'allow' | 'invalidate-push' | 'revoke-approval' | 'deny'} AuthorizationKind
 *
 * @typedef {{
 *   kind: AuthorizationKind,
 *   skipGate: boolean,
 *   fail: boolean,
 *   removeApprovalLabel?: boolean,
 *   status?: { state: 'failure' | 'success', description: string },
 *   message?: string,
 * }} AuthorizationDecision
 */

/**
 * Decide whether the Codex connector gate may run for a pull request.
 *
 * @param {{
 *   draft: boolean,
 *   authorAssociation: string,
 *   labelNames: readonly string[],
 *   eventAction?: string,
 *   removedLabelName?: string | null,
 * }} input
 * @returns {AuthorizationDecision}
 */
export function decideCodexReviewAuthorization(input) {
  const { draft, authorAssociation, labelNames, eventAction = "", removedLabelName = null } = input;

  if (draft) {
    return {
      kind: "skip-draft",
      skipGate: true,
      fail: false,
    };
  }

  const trusted = TRUSTED_ASSOCIATIONS.has(authorAssociation);
  const approved = labelNames.includes(APPROVAL_LABEL);

  if (eventAction === "unlabeled" && removedLabelName === APPROVAL_LABEL && !trusted) {
    return {
      kind: "revoke-approval",
      skipGate: true,
      fail: true,
      status: {
        state: "failure",
        description: "External approval label removed",
      },
      message:
        "The codex-review-approved label was removed; Codex review is no longer authorized for this external contribution.",
    };
  }

  if (trusted) {
    return {
      kind: "allow",
      skipGate: false,
      fail: false,
    };
  }

  if (eventAction === "synchronize" && approved) {
    return {
      kind: "invalidate-push",
      skipGate: true,
      fail: true,
      removeApprovalLabel: true,
      status: {
        state: "failure",
        description: "External approval invalidated by new push",
      },
      message: "A new push invalidated the external-contributor review approval.",
    };
  }

  if (approved) {
    return {
      kind: "allow",
      skipGate: false,
      fail: false,
    };
  }

  return {
    kind: "deny",
    skipGate: true,
    fail: true,
    status: {
      state: "failure",
      description: "Maintainer must add codex-review-approved",
    },
    message:
      "A maintainer must add the codex-review-approved label before Codex reviews an external contribution.",
  };
}
