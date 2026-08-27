/**
 * Choosing what to roll back to is the one piece of judgement in an otherwise
 * mechanical tool, and it runs after a human has already approved the action —
 * so it is separated from the database work and tested on its own.
 */

export interface DeployRow {
  version: string;
  status: string;
}

export type RollbackChoice =
  | { ok: true; target: string }
  | { ok: false; reason: string };

/**
 * @param history Deploy rows for one service, newest first.
 * @param toVersion An explicitly requested target, if the operator named one.
 */
export function chooseRollbackTarget(
  service: string,
  history: DeployRow[],
  toVersion?: string,
): RollbackChoice {
  if (history.length === 0) {
    return { ok: false, reason: `No deploy history for ${service}; nothing to roll back to.` };
  }

  const running = history[0]!.version;
  const versions = history.map((row) => row.version);

  // Rolling back twice must not reinstate the release we just backed out of,
  // so a version that has ever been rolled back is never the default target —
  // walk back to the newest release that is still trusted. A version named
  // explicitly is honoured as given: that is a deliberate instruction from
  // someone who has already approved this action.
  const rolledBack = new Set(
    history.filter((row) => row.status === "rolled_back").map((row) => row.version),
  );
  const target =
    toVersion ?? versions.find((version) => version !== running && !rolledBack.has(version));

  if (!target) {
    return {
      ok: false,
      reason: `${service} has no earlier release to fall back to: every other version in its history has already been rolled back.`,
    };
  }
  if (!versions.includes(target)) {
    return {
      ok: false,
      reason: `Version "${target}" was never deployed for ${service}. Previously deployed: ${[...new Set(versions)].join(", ")}.`,
    };
  }
  if (target === running) {
    return { ok: false, reason: `${service} is already running ${target}.` };
  }
  return { ok: true, target };
}
