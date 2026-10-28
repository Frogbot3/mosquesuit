// No runtime schema imports here: the sandboxed preload only needs channel names.
export const CHANNELS = {
  snapshot: 'workspace:snapshot',
  settings: 'workspace:save-settings',
  health: 'workspace:check-storage',
  reset: 'workspace:reset-demo',
  families: 'registry:list-families',
  family: 'registry:get-family',
  saveFamily: 'registry:save-family',
  members: 'registry:list-members',
  member: 'registry:get-member',
  events: 'events:list', event: 'events:get', saveEvent: 'events:save', transitionEvent: 'events:transition',
  categories: 'events:categories', saveCategory: 'events:save-category', transfer: 'events:transfer', transfers: 'events:transfers',
  attachDocument: 'events:attach-document', exportDocument: 'events:export-document', outputEvent: 'events:output',
} as const;
