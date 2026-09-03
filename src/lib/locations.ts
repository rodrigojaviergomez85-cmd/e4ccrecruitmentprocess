export type Country = {
  code: string;
  name: string;
  dial_code: string;
  flag: string;
  timezone: string;
  active: boolean;
  sort_order: number;
};

export type City = {
  id: string;
  country_code: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export const OTHER_CITY_VALUE = "__other__";

/** Extra dialing countries offered in the phone selector beyond the allowed application countries. */
export const EXTRA_DIAL_CODES: Array<{ code: string; name: string; dial_code: string; flag: string }> = [
  { code: "US", name: "United States", dial_code: "+1", flag: "🇺🇸" },
  { code: "ES", name: "Spain", dial_code: "+34", flag: "🇪🇸" },
  { code: "CR", name: "Costa Rica", dial_code: "+506", flag: "🇨🇷" },
  { code: "PA", name: "Panama", dial_code: "+507", flag: "🇵🇦" },
  { code: "DO", name: "Dominican Republic", dial_code: "+1", flag: "🇩🇴" },
  { code: "EC", name: "Ecuador", dial_code: "+593", flag: "🇪🇨" },
  { code: "PE", name: "Peru", dial_code: "+51", flag: "🇵🇪" },
  { code: "CL", name: "Chile", dial_code: "+56", flag: "🇨🇱" },
  { code: "AR", name: "Argentina", dial_code: "+54", flag: "🇦🇷" },
  { code: "VE", name: "Venezuela", dial_code: "+58", flag: "🇻🇪" },
  { code: "BO", name: "Bolivia", dial_code: "+591", flag: "🇧🇴" },
  { code: "PY", name: "Paraguay", dial_code: "+595", flag: "🇵🇾" },
  { code: "UY", name: "Uruguay", dial_code: "+598", flag: "🇺🇾" },
  { code: "BR", name: "Brazil", dial_code: "+55", flag: "🇧🇷" },
];

export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

/** Build an E.164 number from a dialing code and a local number. */
export function toE164(dialCode: string, localNumber: string): string {
  const dial = digitsOnly(dialCode);
  let local = digitsOnly(localNumber);
  if (dial && local.startsWith(dial) && local.length > dial.length + 5) {
    local = local.slice(dial.length);
  }
  return `+${dial}${local}`;
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
