/**
 * Generic timestamp shim. Firestore values may be:
 *   - Timestamp object (`{ seconds, nanoseconds }`) when reading from
 *     the SDK with `serverTimestamp()` writes
 *   - Number (epoch ms) when written explicitly via `Date.now()`
 *   - String (ISO 8601) when serialized through Cloud Functions
 *
 * Concrete services pick a canonical form per field and document.
 * This union avoids forcing the client bundle to import
 * `firebase/firestore` just to get the `Timestamp` type alias.
 *
 * Originally defined in src/ts/types/research.ts (R150a),
 * extracted to shared/domain/ in R158a Phase 1.
 */
export type ResearchTimestamp =
  | number
  | string
  | { seconds: number; nanoseconds: number };
