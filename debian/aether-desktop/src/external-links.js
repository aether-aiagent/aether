'use strict';

// External link policy for shell:openExternal.
// Owner/project links are explicitly allowlisted; other http(s)/mailto links
// (e.g. assistant markdown links) keep the pre-existing protocol-only gate.
const OWNER_TELEGRAM_URL = 'https://t.me/AetherAIAgent';
const OWNER_GITHUB_URL = 'https://github.com/jcufyr6d5djj-beep/aether';

const EXTERNAL_LINK_ALLOWLIST = [
  'https://t.me/AetherAIAgent',
  'https://t.me/',
  'https://github.com/jcufyr6d5djj-beep/aether',
];

function isAllowlistedUrl(url) {
  const u = String(url || '');
  return EXTERNAL_LINK_ALLOWLIST.some((entry) => u === entry || u.startsWith(entry));
}

function isAllowedExternalUrl(url) {
  const u = String(url || '');
  if (isAllowlistedUrl(u)) return true;
  return /^https?:/i.test(u) || /^mailto:/i.test(u);
}

module.exports = {
  OWNER_TELEGRAM_URL,
  OWNER_GITHUB_URL,
  EXTERNAL_LINK_ALLOWLIST,
  isAllowlistedUrl,
  isAllowedExternalUrl,
};