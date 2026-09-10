const ALPHA2_TO_NUMERIC = {
  AE: "0784",
  AR: "0032",
  AT: "0040",
  AU: "0036",
  BE: "0056",
  BR: "0076",
  CA: "0124",
  CH: "0756",
  CL: "0152",
  CN: "0156",
  CO: "0170",
  CZ: "0203",
  DE: "0276",
  DK: "0208",
  EG: "0818",
  ES: "0724",
  FI: "0246",
  FR: "0250",
  GB: "0826",
  GH: "0288",
  HK: "0344",
  ID: "0360",
  IE: "0372",
  IL: "0376",
  IN: "0356",
  IT: "0380",
  JP: "0392",
  KE: "0404",
  KR: "0410",
  MX: "0484",
  MY: "0458",
  NG: "0566",
  NL: "0528",
  NO: "0578",
  NZ: "0554",
  PE: "0604",
  PH: "0608",
  PK: "0586",
  PL: "0616",
  PT: "0620",
  RU: "0643",
  SA: "0682",
  SE: "0752",
  SG: "0702",
  TH: "0764",
  TR: "0792",
  TW: "0158",
  US: "0840",
  VN: "0704",
  ZA: "0710",
} satisfies Record<string, string>;

type Alpha2Code = keyof typeof ALPHA2_TO_NUMERIC;

function isAlpha2Code(value: string): value is Alpha2Code {
  return value in ALPHA2_TO_NUMERIC;
}

export function alpha2ToNumeric(alpha2: string): string {
  const code = alpha2.toUpperCase();
  return isAlpha2Code(code) ? ALPHA2_TO_NUMERIC[code] : alpha2;
}
