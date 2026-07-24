// Every quota, cap, and limit check in the product lives in this file
// (AGENTS.md Section 4 / Section 3 rule 4). Nothing outside this module
// writes an `if (count >= limit)` check inline in a route handler.
//
// Implemented incrementally as each limit's feature is built:
//   - FR-7  project cap (3 free / 50 pro)
//   - FR-9  document-per-project cap (10 free / 25 pro)
//   - FR-21 monthly analysis run cap (3 free / 30 pro)
//   - FR-22 / FR-22b analysis input word/token floor and ceiling
//   - FR-31 daily chat message cap (30 free / 500 pro)
//   - FR-42 storage cap (100 MB free / 2 GB pro)

export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public readonly quota: string,
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}
