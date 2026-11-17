// Account credentials and request bodies must not follow an upstream redirect
// to an unapproved destination. Callers should configure the canonical API URL.
export const ACCOUNT_REDIRECT_STATUSES = Object.freeze([301, 302, 303, 307, 308]);
