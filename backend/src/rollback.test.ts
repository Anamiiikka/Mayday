import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseRollbackTarget, type DeployRow } from "./rollback.js";

/** Deploy rows come back newest first, which is what the chooser relies on. */
const history = (...rows: [string, string][]): DeployRow[] =>
  rows.map(([version, status]) => ({ version, status }));

describe("chooseRollbackTarget", () => {
  it("falls back to the release that ran before the current one", () => {
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.2", "active"], ["v1.4.1", "superseded"]),
    );
    assert.deepEqual(choice, { ok: true, target: "v1.4.1" });
  });

  it("skips a version that has already been rolled back", () => {
    // The scenario that matters: roll back v1.4.2, then roll back again. The
    // second rollback must not reinstate the release just backed out of.
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.1", "active"], ["v1.4.2", "rolled_back"], ["v1.4.0", "superseded"]),
    );
    assert.deepEqual(choice, { ok: true, target: "v1.4.0" });
  });

  it("refuses when every earlier release has been rolled back", () => {
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.1", "active"], ["v1.4.2", "rolled_back"]),
    );
    assert.equal(choice.ok, false);
    assert.match(choice.ok ? "" : choice.reason, /no earlier release/);
  });

  it("refuses a service with no deploy history", () => {
    const choice = chooseRollbackTarget("ghost-svc", []);
    assert.equal(choice.ok, false);
    assert.match(choice.ok ? "" : choice.reason, /No deploy history/);
  });

  it("refuses a version that was never deployed, and says what was", () => {
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.2", "active"], ["v1.4.1", "superseded"]),
      "v9.9.9",
    );
    assert.equal(choice.ok, false);
    assert.match(choice.ok ? "" : choice.reason, /never deployed/);
    assert.match(choice.ok ? "" : choice.reason, /v1\.4\.2, v1\.4\.1/);
  });

  it("refuses a rollback to the version already running", () => {
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.2", "active"], ["v1.4.1", "superseded"]),
      "v1.4.2",
    );
    assert.equal(choice.ok, false);
    assert.match(choice.ok ? "" : choice.reason, /already running/);
  });

  it("honours an explicitly named version even if it was rolled back before", () => {
    // Someone approved this exact call with this exact argument. Second-guessing
    // it would mean doing something other than what was cleared.
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.1", "active"], ["v1.4.2", "rolled_back"], ["v1.4.0", "superseded"]),
      "v1.4.2",
    );
    assert.deepEqual(choice, { ok: true, target: "v1.4.2" });
  });

  it("does not treat a repeated version as a separate release", () => {
    // A rollback re-inserts an older version as the active row, so the same
    // version can appear twice with different statuses.
    const choice = chooseRollbackTarget(
      "checkout-api",
      history(["v1.4.1", "active"], ["v1.4.2", "rolled_back"], ["v1.4.1", "superseded"]),
    );
    assert.equal(choice.ok, false);
    assert.match(choice.ok ? "" : choice.reason, /no earlier release/);
  });
});
