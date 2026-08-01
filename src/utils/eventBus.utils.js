import { EventEmitter } from 'events';

class EventBus extends EventEmitter {}

export const eventBus = new EventBus();
export default eventBus;
