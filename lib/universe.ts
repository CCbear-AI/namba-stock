import data from "@/data/universe.json";

export type Stock = { c: string; n: string; m: "tse" | "otc"; ind: string; sh: number };
export const UNIVERSE = data as Stock[];
export const BY_CODE = new Map(UNIVERSE.map((s) => [s.c, s]));
