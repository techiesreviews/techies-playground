# Checks spinner delay

- Date: 2026-11-21
- Owner: fleet-lead
- Status: complete
- Disposition: kept
- Related version: 0.12.1
- Related issue: TOOLS-388, SL-1; follow-up to PR #62

## Context

The spin utility overrode the reveal animation on the same element, making the Checks spinner appear immediately.

## Implementation

Put the existing 200 ms reveal animation on an inline-flex wrapper around each of the three Checks spinners. The child retains its spin animation and reduced-motion handling. Leaving both animations on the same element would retain the bug.

## Tests and evidence

The strengthened source-inspection regression failed before the fix (18 passed, 1 failed). After the fix, `scripts/agents/kit unit --affected` passed 19/19. This verifies the animation separation in markup, not actual browser timing. The existing CSS still specifies 200 ms step-end visibility.

## Documentation impact

Updated the test inventory, app changelog, version files and context version. The documented 200 ms behavior is unchanged; this fix makes the implementation honor it.

## Follow-ups

The 23 nits from PR #62 remain outside this fix.
