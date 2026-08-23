// Move 検知テスト用 Target: main 関数を先頭に、helper 関数を末尾に移動

export function processOrder(items: { price: number; quantity: number }[], taxRate: number): string {
  const subtotal = calculateSubtotal(items);
  const total = subtotal * (1 + taxRate);
  return formatCurrency(total);
}

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
