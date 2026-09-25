import { Decimal } from "@prisma/client/runtime/library";

export function toDate(value: unknown) {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toDecimal(value: unknown, fallback = 0) {
  return new Decimal(toNumber(value, fallback));
}

export function toStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .filter(Boolean);
}

export function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

export function endOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

export function monthBounds(date = new Date()) {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ),
  };
}

export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}
