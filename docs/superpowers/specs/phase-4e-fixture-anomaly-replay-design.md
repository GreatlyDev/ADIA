# Phase 4E Fixture Anomaly Replay Design

## Objective

Extend the existing local parsed fixture replay path so it persists deterministic anomalies after parser persistence.

The replay flow should:

- Validate the existing fixture envelope.
- Ingest deployment run and raw evidence metadata.
- Read local Terraform and Checkov JSON fixtures.
- Run deterministic parsers.
- Persist parser output.
- Run Phase 4D anomaly persistence over the persisted parser rows.
- Return parser, anomaly, and evidence-link counts.

This phase remains local and server-side only. It does not expose API routes, call LLMs, execute Terraform, execute Checkov, fetch artifacts, run cloud commands, or wire dashboard data.

## Integration Point

`replayParsedFixture` is the right boundary because it already coordinates local fixture validation, parser execution, and parser persistence.

Phase 4E should call `persistFixtureAnomalies` only after `persistParsedFixtureEvidence` succeeds, so anomalies are generated from persisted database row IDs rather than parser-local IDs.

## Result Shape

Replay should return:

- `anomalyCount`
- `parserEvidenceLinkCount`
- `anomalyEvidenceLinkCount`
- `evidenceLinkCount` as the total parser plus anomaly evidence links

Keeping parser and anomaly link counts separate makes replay output clearer while preserving a total evidence-link count for demos.

## Tests

Tests should verify:

- Local replay persists parser output, anomalies, and evidence links.
- The fake replay database contains anomaly rows after replay.
- Replaying the same fixture remains duplicate-safe.
- Unsafe fixture paths are still rejected before database writes.
