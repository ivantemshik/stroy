// Проверка токена GitHub Actions (OIDC): плановая проверка каждые 15 минут запускается из GitHub Actions
// без секретов в репозитории. Токен подписан GitHub, в нём видно репозиторий и файл сценария.
import {createPublicKey, verify} from 'node:crypto';

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
let cache = null;

async function githubKeys() {
  if (cache && Date.now() - cache.at < 3600_000) return cache.keys;
  const response = await fetch(`${GITHUB_ISSUER}/.well-known/jwks`, {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error(`GitHub JWKS: ${response.status}`);
  cache = {at: Date.now(), keys: (await response.json()).keys || []};
  return cache.keys;
}

const part = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

// true, если токен подписан GitHub, выдан для нашего адресата, не истёк и пришёл из нужного репозитория и сценария.
export async function verifyGithubActionsToken(token, {audience, repository, workflow, keys = null, now = Date.now() / 1000}) {
  const pieces = String(token || '').split('.');
  if (pieces.length !== 3) return false;
  let header, claims;
  try { header = part(pieces[0]); claims = part(pieces[1]); } catch { return false; }
  if (header.alg !== 'RS256' || !header.kid) return false;
  const jwk = (keys || await githubKeys()).find(key => key.kid === header.kid);
  if (!jwk) return false;
  const signed = verify('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), createPublicKey({key: jwk, format: 'jwk'}), Buffer.from(pieces[2], 'base64url'));
  return signed
    && claims.iss === GITHUB_ISSUER
    && claims.aud === audience
    && typeof claims.exp === 'number' && claims.exp > now
    && (claims.nbf === undefined || claims.nbf <= now + 60)
    && claims.repository === repository
    && String(claims.workflow_ref || '').includes(`/.github/workflows/${workflow}@`);
}
