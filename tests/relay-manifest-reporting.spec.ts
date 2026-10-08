import { describe, expect, it } from 'vitest';
import { buildRelayAppDescriptor, createManifest } from '../src/manifest';

describe('Relay manifest reporting', () => {
  it('includes the exact reviewed manifest in the descriptor used by Hub Refresh', () => {
    expect(buildRelayAppDescriptor().manifest).toEqual(createManifest());
  });
});
