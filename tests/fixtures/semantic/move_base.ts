// Move 検知テスト用 Base: 先頭に helper 関数、末尾に main 関数

export function calculateSubtotal(items: { price: number; quantity: number }[]): number {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
  }
  return subtotal;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function processOrder(items: { price: number; quantity: number }[], taxRate: number): string {
  const subtotal = calculateSubtotal(items);
  const total = subtotal * (1 + taxRate);
  return formatCurrency(total);
}
