/**
 * The Team waitlist — now an ARCHIVE, not an intake.
 *
 * `POST /api/waitlist` collected intent while Team was advertised as "coming
 * soon" and none of what it promised was built. Team shipped, so the endpoint is
 * gone: an open write path for a plan that now exists collects nothing anybody
 * would act on, and every public writer is a surface worth not having.
 *
 * What stays is the data and a way to read it. The JSONL files are on the
 * persistent volume (so they ride the nightly backup) because the pricing page
 * promised those people an email, and server/waitlist-cli.js is what sends it.
 * Deleting the list would quietly break that promise.
 *
 * To collect intent for some future unbuilt plan, `git show <this commit>^` has
 * the intake side — rate limiting, idempotency, the owner notification and the
 * tests for all of it — rather than it living here unreferenced.
 */
import { readFileSync } from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const WAITLIST_DIR = process.env.WAITLIST_DIR || path.join(DATA_DIR, "waitlist");

const filePath = (plan) => path.join(WAITLIST_DIR, `${plan}.jsonl`);

/**
 * Everyone on a plan's waitlist, oldest first.
 *
 * A corrupt line is skipped rather than thrown on: a half-written record from a
 * crash must not make the rest of the list unreadable, which is exactly when
 * someone needs to read it.
 */
export function readWaitlist(plan) {
  try {
    return readFileSync(filePath(plan), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
