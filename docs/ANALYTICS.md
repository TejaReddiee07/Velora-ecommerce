# Revenue & analytics rules

All figures in the owner dashboard are computed from MongoDB order and payment records. No numbers are hard-coded or estimated.

## Which orders count

An order counts toward revenue **only if Stripe has confirmed the payment**, meaning `paymentStatus` is `paid`, `partially_refunded` or `refunded`.

These are **excluded**:
- checkouts awaiting payment (`pending`)
- expired checkouts
- failed payments
- checkouts cancelled before payment

Revenue is recognised on the **payment date** (`paidAt`). Refunds are recognised on the **date of the refund**.

## Definitions (per period)

| Metric | Definition |
| --- | --- |
| Gross sales | Σ item subtotals (selling price × quantity, after product sale prices, before order-level discounts) |
| Discounts | Σ coupon and automatic-promotion discounts |
| Delivery charges | Σ delivery collected |
| Taxes | Σ tax collected (with tax-inclusive pricing, this is the tax portion of the total) |
| Total collected | Σ order totals charged by Stripe |
| Refunds | Σ refunds issued in the period, whether from the owner portal or the Stripe Dashboard |
| **Net revenue** | **Total collected − Taxes − Refunds** |
| Average order value | Total collected ÷ paid orders |
| Units sold | Σ item quantities on paid orders |
| Cost of goods | Σ unit cost × quantity, using the cost **saved on the order at purchase time** |
| Gross profit | Net revenue − cost of goods. **Only shown when every sold line has a cost price**; otherwise the dashboard shows the cost coverage % and asks the owner to add costs. Delivery costs and other expenses aren't tracked, so this is gross profit, not net profit. |

## Currencies

Each order stores its currency and the **exchange rate in effect at checkout** (`fxRate` = units of that currency per 1 unit of the base currency). Dashboard totals convert every order to the base currency (GBP by default) as `amount ÷ fxRate`. GBP and USD amounts are never added together unconverted. The overview also shows totals per currency in their original amounts.

## Time windows

- **Today, this week (starting Monday), this month, this year, all time:** server local time.
- **Charts:** grouped by day, week, month or year in `Europe/London` time; periods with no sales are shown as zero.
- **Custom range:** the date filter applies to the period breakdown, the charts, best sellers, sales by category and top customers.

## Export

`GET /api/admin/analytics/export.csv?from=&to=` exports every order created in the range, with status, payment status, currency, subtotal, discount, delivery, tax, total, refunded amount, exchange rate, total in base currency and SKUs. Cell values are escaped so spreadsheet programs won't execute them as formulas.
