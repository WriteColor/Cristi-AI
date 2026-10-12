/**
 * Live2D Model Profiles Index
 */

import type { ModelProfile } from '../types.ts';
import { jane_doeProfile } from './jane_doe.profile.ts';
import { yanderegirlProfile } from './yanderegirl.profile.ts';

export const ALL_MODEL_PROFILES: ModelProfile[] = [
  yanderegirlProfile,
  jane_doeProfile,
];

export const MODEL_PROFILES_MAP: Record<string, ModelProfile> = {
  'yanderegirl': yanderegirlProfile,
  'jane_doe': jane_doeProfile,
};

export {
  yanderegirlProfile,
  jane_doeProfile,
};
