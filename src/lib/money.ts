import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal;

export function money(v: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(v ?? 0);
}

export function moneyZero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

export function moneyAdd(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(a ?? 0).add(b ?? 0);
}

export function moneySub(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(a ?? 0).sub(b ?? 0);
}

export function moneyMul(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(a ?? 0).mul(b ?? 0);
}

export function moneyDiv(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(a ?? 0).div(b ?? 0);
}

export function moneyMax(a: Prisma.Decimal.Value, b: Prisma.Decimal.Value): Prisma.Decimal {
  const da = new Prisma.Decimal(a ?? 0);
  const db = new Prisma.Decimal(b ?? 0);
  return da.gte(db) ? da : db;
}

export function sumMoney(values: Prisma.Decimal.Value[]): Prisma.Decimal {
  let acc: Prisma.Decimal = new Prisma.Decimal(0);
  for (const v of values) acc = acc.add(new Prisma.Decimal(v ?? 0));
  return acc;
}

export function toNumber(v: Prisma.Decimal.Value): number {
  return Number(v ?? 0);
}

export function toDb(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}
