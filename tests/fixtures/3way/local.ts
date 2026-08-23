export function calculateTotal(items: number[]): number {
  // Local implementation: add tax calculation
  const subtotal = items.reduce((sum, item) => sum + item, 0);
  const tax = subtotal * 0.1;
  return subtotal + tax;
}
