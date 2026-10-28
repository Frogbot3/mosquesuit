import { vi } from 'vitest';
export function lifeApiMocks() { return { listEvents:vi.fn(),getEvent:vi.fn(),saveEvent:vi.fn(),transitionEvent:vi.fn(),getEventCategories:vi.fn(),saveEventCategory:vi.fn(),transferMember:vi.fn(),getTransfers:vi.fn(),attachEventDocument:vi.fn(),exportEventDocument:vi.fn(),outputEvent:vi.fn() }; }
