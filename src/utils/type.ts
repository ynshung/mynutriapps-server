export const toArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item !== "");
  }
  return value === "" ? [] : [value];
}

export const toValidStringArrayOrNull = (value: string | string[] | undefined): string[] | null => {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim() === "" ? null : [value];
  }
  if (Array.isArray(value)) {
    const filteredArray = value.filter((str) => str.trim() !== "");
    return filteredArray.length === 0 ? null : filteredArray;
  }
  return null;
}

export const toStrOrNull = (value: number | string | undefined | null): string | null => {
  return value === undefined || value === null || value === "" ? null : value.toString();
}

export const toFloatOrNaN = (value: string | null | undefined): number => {
  if (value === undefined || value === null) {
    return NaN;
  }
  const parsedValue = parseFloat(value);
  return isNaN(parsedValue) ? NaN : parsedValue;
}
