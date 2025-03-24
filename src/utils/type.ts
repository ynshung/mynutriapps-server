export const toArray = <T>(value: T | T[] | undefined): T[] => {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
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

export const toStrOrNull = (value: number | string | undefined): string | null => {
  return value === undefined || value === "" ? null : value.toString();
}
