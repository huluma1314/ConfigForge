import type { WarningItem } from "../domain/types";

export class WarningCollector {
  private readonly items: WarningItem[] = [];

  add(level: WarningItem["level"], message: string): void {
    this.items.push({ level, message });
  }

  extend(items: WarningItem[]): void {
    this.items.push(...items);
  }

  list(): WarningItem[] {
    return this.items;
  }
}
