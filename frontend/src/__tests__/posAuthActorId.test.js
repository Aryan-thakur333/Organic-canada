import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPosStaffAuth, getPosAuthActorId, clearPosStaffAuth } from '../services/apiClient';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

function createToken(payload = {}) {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.`;
}

describe('POS auth actor_id extraction', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('extracts actor_id from token payload', () => {
    const token = createToken({ actor_id: 'user_123', email: 'test@example.com' });
    const actorId = setPosStaffAuth(token);
    expect(actorId).toBe('user_123');
    expect(getPosAuthActorId()).toBe('user_123');
  });

  it('ignores JWT sub field', () => {
    const token = createToken({ sub: 'user_456', actor_id: 'user_123' });
    const actorId = setPosStaffAuth(token);
    expect(actorId).toBe('user_123');
  });

  it('does NOT fallback to user_id when actor_id is present', () => {
    const token = createToken({ actor_id: 'user_123', user_id: 'user_999' });
    const actorId = setPosStaffAuth(token);
    expect(actorId).toBe('user_123');
  });

  it('throws POS_AUTH_ACTOR_ID_MISSING when actor_id is missing', () => {
    const token = createToken({ email: 'test@example.com' });
    try {
      setPosStaffAuth(token);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('POS_AUTH_ACTOR_ID_MISSING');
    }
  });

  it('throws POS_AUTH_ACTOR_ID_MISSING when payload has only user_id', () => {
    const token = createToken({ user_id: 'user_999' });
    try {
      setPosStaffAuth(token);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('POS_AUTH_ACTOR_ID_MISSING');
    }
  });

  it('throws when token is empty', () => {
    try {
      setPosStaffAuth('');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('POS_AUTH_ACTOR_ID_MISSING');
    }
  });

  it('clears all POS auth keys', () => {
    const token = createToken({ actor_id: 'user_123' });
    setPosStaffAuth(token);
    expect(getPosAuthActorId()).toBe('user_123');
    clearPosStaffAuth();
    expect(getPosAuthActorId()).toBeNull();
    expect(localStorage.getItem('eatsie_pos_token')).toBeNull();
    expect(localStorage.getItem('eatsie_pos_auth_scope')).toBeNull();
  });
});