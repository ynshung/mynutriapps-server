export function isValidEAN13(barcode: string): boolean {
  if (!/^[0-9]{13}$/.test(barcode)) {
    return false; // Must be exactly 13 digits
  }

  const digits = barcode.split('').map(Number);
  const checkDigit = digits.pop();
  
  const sum = digits.reduce((acc, digit, index) => {
    return acc + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);
  
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  
  return checkDigit === calculatedCheckDigit;
}