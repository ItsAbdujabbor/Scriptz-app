/**
 * App-wide shared constants.
 *
 * Keep values here when they must stay in sync across multiple
 * components (and ideally with the backend). Drifting copies of the
 * same limit in different files is a recurring source of subtle bugs.
 */

/**
 * Max length for a persona / character name. Matches the backend
 * validation limit. Used by both the create flow
 * (CreatePersonaDialog) and the library editor (PersonasModal).
 */
export const PERSONA_NAME_MAX_LENGTH = 40
