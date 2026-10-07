import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('kridt og kø');
    expect(await verifyPassword('kridt og kø', stored)).toBe(true);
    expect(await verifyPassword('kridt og ko', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('never stores the password itself', async () => {
    expect(await hashPassword('hemmelig')).not.toContain('hemmelig');
  });

  it('rejects a malformed stored hash', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});
