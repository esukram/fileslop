import { randomBytes } from "node:crypto";

// File ids (ADR-019): 18 random Bech32 characters (90 bits) and a 6-character Bech32m checksum
// (BIP-350). The checksum covers the human-readable part "fileslop", but the id does not show it.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const FILE_ID_RE = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{24}$/;
const BECH32M_CONST = 0x2bc830a3;
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const HRP = [...Buffer.from("fileslop")];
const HRP_VALUES = [...HRP.map((c) => c >> 5), 0, ...HRP.map((c) => c & 31)];

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (const [i, gen] of GENERATOR.entries()) if ((top >>> i) & 1) chk ^= gen;
  }
  return chk;
}

/** Creates a new file id. `random` is for tests only: each byte gives one character. */
export function newFileId(random: Uint8Array = randomBytes(18)): string {
  // 256 is a multiple of 32, so the low 5 bits of a random byte are uniform.
  const data = [...random].map((byte) => byte & 31);
  const mod = polymod([...HRP_VALUES, ...data, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST;
  const checksum = [25, 20, 15, 10, 5, 0].map((shift) => (mod >>> shift) & 31);
  return [...data, ...checksum].map((value) => CHARSET.charAt(value)).join("");
}

/** True for a lowercase file id with a valid checksum. */
export const isFileId = (id: string): boolean =>
  FILE_ID_RE.test(id) &&
  polymod([...HRP_VALUES, ...Array.from(id, (c) => CHARSET.indexOf(c))]) === BECH32M_CONST;
