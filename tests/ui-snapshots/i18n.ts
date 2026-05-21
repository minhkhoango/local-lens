import messages from '../../public/_locales/en/messages.json';

type Entry = { message: string; description?: string };
const map = messages as Record<string, Entry>;

export function realGetMessage(key: string): string {
  return map[key]?.message ?? key;
}
