# Ruby Move 検知テスト用 Base

def calculate_discount(price, rate)
  price * rate
end

def format_price(amount)
  "$#{'%.2f' % amount}"
end

def checkout(cart_items)
  total = cart_items.sum { |item| item[:price] }
  discount = calculate_discount(total, 0.1)
  format_price(total - discount)
end
