export function calculateTotal(items: number[]): number {
  // Remote implementation: add discount calculation
  const subtotal = items.reduce((sum, item) => sum + item, 0);
  const discount = subtotal > 100 ? 10 : 0;
  return subtotal - discount;
}
