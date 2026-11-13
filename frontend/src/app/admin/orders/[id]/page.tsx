'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api, ApiError, imageUrl } from '@/lib/api';
import { cn, dateTime, money, statusLabel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Textarea, fieldErrors } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Media';
import { Banner, ConfirmDialog, Dialog, KeyValue, Panel, StatusChip } from '@/components/admin/ui';
import { errorMessage, toMinor, useCan, useRealtime } from '@/lib/admin/hooks';
import type { OrderDetailResponse } from '@/lib/admin/types';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const canWrite = useCan('orders:write');
  const canRefund = useCan('orders:refund');
  const key = ['admin', 'order', id];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: key, queryFn: () => api<OrderDetailResponse>(`/admin/orders/${id}`) });

  useRealtime(['order:updated', 'order:created'], (_e, payload) => {
    if ((payload as { _id?: string })._id === id) qc.invalidateQueries({ queryKey: key });
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    qc.invalidateQueries({ queryKey: ['admin', 'analytics'] });
  };

  const [statusNote, setStatusNote] = useState('');
  const [tracking, setTracking] = useState({ carrier: '', number: '', url: '' });
  const [trackingErrors, setTrackingErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState({ mode: 'full' as 'full' | 'partial', amount: '', reason: '', restock: false });
  const [refundConfirm, setRefundConfirm] = useState(false);

  const advance = useMutation({
    mutationFn: (status: string) => api(`/admin/orders/${id}/status`, { method: 'PUT', body: { status, note: statusNote || undefined } }),
    onSuccess: (_d, status) => {
      toast.success(`Marked as ${statusLabel(status).toLowerCase()}`);
      setStatusNote('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveTracking = useMutation({
    mutationFn: () => api(`/admin/orders/${id}/tracking`, { method: 'PUT', body: { carrier: tracking.carrier, number: tracking.number, url: tracking.url || '' } }),
    onSuccess: () => {
      toast.success('Tracking saved');
      setTrackingErrors({});
      refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError) setTrackingErrors(fieldErrors(e.fields));
      toast.error(errorMessage(e));
    },
  });
  const addNote = useMutation({
    mutationFn: () => api(`/admin/orders/${id}/notes`, { body: { message: note } }),
    onSuccess: () => {
      toast.success('Note added');
      setNote('');
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => api(`/admin/orders/${id}/cancel`, { body: { reason: cancelReason || undefined } }),
    onSuccess: () => {
      toast.success('Order cancelled');
      setCancelOpen(false);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const doRefund = useMutation({
    mutationFn: (body: { amount?: number; reason?: string; restock: boolean }) => api(`/admin/orders/${id}/refund`, { body }),
    onSuccess: () => {
      toast.success('Refund issued through Stripe');
      setRefundConfirm(false);
      setRefundOpen(false);
      setRefund({ mode: 'full', amount: '', reason: '', restock: false });
      refresh();
    },
    onError: (e) => {
      setRefundConfirm(false);
      toast.error(errorMessage(e));
    },
  });

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  if (isError || !data)
    return (
      <p className="py-24 text-center text-muted">
        Order not found. <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
      </p>
    );

  const { order, payment, customer, allowedStatuses } = data;
  const cur = order.currency;
  const remaining = order.total - order.refundedTotal;
  const canCancelOrder = order.paymentStatus === 'pending' || ['paid', 'processing', 'packed'].includes(order.status);
  const canRefundOrder = ['paid', 'partially_refunded'].includes(order.paymentStatus) && remaining > 0;
  const refundAmountMinor = refund.mode === 'full' ? remaining : toMinor(refund.amount);
  const refundInvalid = refund.mode === 'partial' && (!refundAmountMinor || refundAmountMinor <= 0 || refundAmountMinor > remaining);

  return (
    <>
      <Link href="/admin/orders" className="mb-4 inline-flex items-center gap-2 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All orders
      </Link>
      <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow mb-2 text-gold-deep">Order</p>
          <h1 className="text-[2.2rem] leading-tight">{order.orderNumber}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <StatusChip status={order.status} />
            <StatusChip status={order.paymentStatus} />
            <span>Placed {dateTime(order.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRefund && canRefundOrder && (
            <Button variant="secondary" size="sm" onClick={() => setRefundOpen(true)}>
              Refund
            </Button>
          )}
          {canRefund && canCancelOrder && order.status !== 'cancelled' && (
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </div>
      </header>

      {order.stockConflict && (
        <Banner tone="danger">
          <strong>Stock conflict.</strong> This order was paid after its stock reservation expired and some items had sold out. Restock the items or refund the customer.
        </Banner>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Panel title={`Items (${order.items.reduce((s, i) => s + i.quantity, 0)})`} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {order.items.map((it) => (
                <li key={it._id} className="flex gap-4 px-5 py-4">
                  <div className="h-20 w-16 shrink-0 overflow-hidden bg-sand">
                    {it.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(it.image)} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${it.product}`} className="text-[15px] text-ink hover:underline">
                      {it.name}
                    </Link>
                    <p className="text-[13px] text-muted">
                      {it.color} · {it.size} · <span className="font-mono text-[12px]">{it.sku}</span>
                    </p>
                    {it.restocked > 0 && <p className="text-[12px] text-success">{it.restocked} restocked</p>}
                  </div>
                  <div className="tabular text-right text-[14px]">
                    <p className="text-ink">{money(it.lineTotal, cur)}</p>
                    <p className="text-[12px] text-muted">
                      {it.quantity} × {money(it.unitPrice, cur)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="border-t border-line px-5 py-4">
              <KeyValue label="Subtotal"><span className="tabular">{money(order.subtotal, cur)}</span></KeyValue>
              {order.discountTotal > 0 && (
                <KeyValue label={`Discount${order.coupon ? ` (${order.coupon.code})` : ''}`}>
                  <span className="tabular">−{money(order.discountTotal, cur)}</span>
                </KeyValue>
              )}
              <KeyValue label={`Delivery · ${order.delivery.name}`}><span className="tabular">{order.shippingTotal ? money(order.shippingTotal, cur) : 'Free'}</span></KeyValue>
              {order.taxTotal > 0 && (
                <KeyValue label={order.taxInclusive ? 'Tax included' : 'Tax'}>
                  <span className="tabular">{money(order.taxTotal, cur)}</span>
                </KeyValue>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
                <span>Total</span>
                <span className="tabular">{money(order.total, cur)}</span>
              </div>
              {order.refundedTotal > 0 && (
                <KeyValue label="Refunded">
                  <span className="tabular text-sale">−{money(order.refundedTotal, cur)}</span>
                </KeyValue>
              )}
              {cur !== order.baseCurrency && (
                <p className="mt-2 text-[12px] text-muted">
                  Charged in {cur} at 1 {order.baseCurrency} = {order.fxRate} {cur} (rate saved at checkout).
                </p>
              )}
            </dl>
          </Panel>

          {canWrite && (
            <Panel title="Fulfilment" description="Customers are emailed automatically when an order ships, is out for delivery or is delivered.">
              {allowedStatuses.length ? (
                <>
                  <Input label="Note for the timeline (optional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} maxLength={300} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {allowedStatuses.map((s) => (
                      <Button key={s} size="sm" variant={s === allowedStatuses[0] ? 'primary' : 'secondary'} loading={advance.isPending && advance.variables === s} onClick={() => advance.mutate(s)}>
                        Mark {statusLabel(s).toLowerCase()}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[14px] text-muted">No further status changes are available for a {statusLabel(order.status).toLowerCase()} order.</p>
              )}

              <form
                className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveTracking.mutate();
                }}
              >
                <Input label="Carrier" value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} placeholder={order.tracking?.carrier ?? 'Royal Mail'} required error={trackingErrors.carrier} />
                <Input label="Tracking number" value={tracking.number} onChange={(e) => setTracking({ ...tracking, number: e.target.value })} placeholder={order.tracking?.number ?? ''} required error={trackingErrors.number} />
                <Input label="Tracking URL" type="url" value={tracking.url} onChange={(e) => setTracking({ ...tracking, url: e.target.value })} placeholder="https://" error={trackingErrors.url} />
                <div className="sm:col-span-3">
                  <Button type="submit" size="sm" variant="secondary" loading={saveTracking.isPending} disabled={!tracking.carrier || tracking.number.length < 3}>
                    {order.tracking?.number ? 'Update tracking' : 'Add tracking'}
                  </Button>
                </div>
              </form>
            </Panel>
          )}

          <Panel title="Timeline">
            {canWrite && (
              <form
                className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  addNote.mutate();
                }}
              >
                <Textarea label="Internal note (staff only)" value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="flex-1" className="min-h-12" maxLength={500} />
                <Button type="submit" size="sm" variant="secondary" loading={addNote.isPending} disabled={note.trim().length < 2}>
                  Add note
                </Button>
              </form>
            )}
            <ol className="relative space-y-5 border-l border-line pl-6">
              {[...order.history].reverse().map((h, i) => (
                <li key={i} className="relative">
                  <span className={cn('absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper', h.status === 'note' ? 'bg-line-strong' : 'bg-gold-deep')} aria-hidden />
                  <p className="text-[14px] text-ink">
                    <span className="font-medium">{h.status === 'note' ? 'Note' : statusLabel(h.status)}</span> — {h.message}
                  </p>
                  <p className="text-[12px] text-muted">
                    {dateTime(h.at)} · {h.actor.name ?? h.actor.type}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Customer">
            {customer ? (
              <>
                <Link href={`/admin/customers/${customer._id}`} className="text-[15px] text-ink hover:underline">
                  {customer.name}
                </Link>
                <p className="text-[13px] text-muted">{order.email}</p>
                {order.phone && <p className="text-[13px] text-muted">{order.phone}</p>}
                <p className="mt-2 text-[13px] text-graphite">
                  {customer.paidOrders} paid order{customer.paidOrders === 1 ? '' : 's'} · customer since {dateTime(customer.createdAt).split(',')[0]}
                </p>
              </>
            ) : (
              <p className="text-[14px] text-muted">{order.customerName} · {order.email}</p>
            )}
          </Panel>

          <Panel title="Delivery">
            <address className="text-[14px] not-italic leading-relaxed text-ink">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 && (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              )}
              <br />
              {order.shippingAddress.city}
              {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''} {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country}
            </address>
            <p className="mt-3 text-[13px] text-graphite">
              {order.delivery.name} · {order.delivery.etaDays}
            </p>
            {order.tracking?.number && (
              <p className="mt-2 text-[13px]">
                Tracking: <span className="font-medium">{order.tracking.carrier} {order.tracking.number}</span>{' '}
                {order.tracking.url && (
                  <a href={order.tracking.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-deep underline">
                    Track <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
              </p>
            )}
          </Panel>

          <Panel title="Payment">
            {payment ? (
              <dl>
                <KeyValue label="Status"><StatusChip status={payment.status} /></KeyValue>
                <KeyValue label="Amount"><span className="tabular">{money(payment.amount, payment.currency)}</span></KeyValue>
                {(payment.cardBrand || payment.paymentMethodType) && (
                  <KeyValue label="Method">
                    <span className="capitalize">
                      {payment.wallet ? `${payment.wallet.replace('_', ' ')} · ` : ''}
                      {payment.cardBrand ?? payment.paymentMethodType}
                      {payment.cardLast4 ? ` ·· ${payment.cardLast4}` : ''}
                    </span>
                  </KeyValue>
                )}
                {payment.paidAt && <KeyValue label="Paid">{dateTime(payment.paidAt)}</KeyValue>}
                {payment.paymentIntentId && (
                  <KeyValue label="Payment intent">
                    <span className="break-all font-mono text-[11px]">{payment.paymentIntentId}</span>
                  </KeyValue>
                )}
                {payment.checkoutSessionId && (
                  <KeyValue label="Checkout session">
                    <span className="break-all font-mono text-[11px]">{payment.checkoutSessionId}</span>
                  </KeyValue>
                )}
                {payment.failureMessage && <p className="mt-2 text-[13px] text-danger">Last attempt: {payment.failureMessage}</p>}
                {payment.refunds.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-graphite">Refunds</p>
                    <ul className="space-y-2">
                      {payment.refunds.map((r) => (
                        <li key={r.stripeRefundId} className="text-[13px]">
                          <span className="tabular font-medium">{money(r.amount, payment.currency)}</span> · {statusLabel(r.status)}
                          {r.restocked && ' · restocked'}
                          <span className="block text-[12px] text-muted">
                            {dateTime(r.createdAt)} · {r.createdBy.name ?? r.createdBy.type}
                            {r.reason ? ` · ${r.reason}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-[14px] text-muted">No payment record yet.</p>
            )}
          </Panel>

          {order.notes && (
            <Panel title="Customer note">
              <p className="text-[14px] text-graphite">{order.notes}</p>
            </Panel>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancel.mutate()}
        loading={cancel.isPending}
        destructive
        title="Cancel this order?"
        confirmLabel="Cancel order"
        body={
          order.paymentStatus === 'pending'
            ? 'The open checkout will be expired and its reserved stock returned to sale.'
            : `The customer will receive a full refund of ${money(remaining, cur)} through Stripe and all items will be restocked.`
        }
      >
        <Input label="Reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} wrapperClassName="mt-4" maxLength={300} />
      </ConfirmDialog>

      <Dialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Issue a refund"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRefundOpen(false)}>
              Close
            </Button>
            <Button size="sm" variant="danger" disabled={refundInvalid} onClick={() => setRefundConfirm(true)}>
              Review refund
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[14px] text-graphite">
          Refundable balance: <span className="tabular font-semibold text-ink">{money(remaining, cur)}</span>. Refunds are sent to the customer&apos;s original payment method via Stripe.
        </p>
        <fieldset className="mb-4 space-y-2">
          <legend className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-graphite">Amount</legend>
          {(['full', 'partial'] as const).map((m) => (
            <label key={m} className="flex items-center gap-3 text-[15px]">
              <input type="radio" name="refund-mode" checked={refund.mode === m} onChange={() => setRefund({ ...refund, mode: m, restock: m === 'full' ? refund.restock : false })} className="accent-[var(--color-charcoal)]" />
              {m === 'full' ? `Full refund (${money(remaining, cur)})` : 'Partial refund'}
            </label>
          ))}
        </fieldset>
        {refund.mode === 'partial' && (
          <Input
            label={`Amount (${cur})`}
            inputMode="decimal"
            value={refund.amount}
            onChange={(e) => setRefund({ ...refund, amount: e.target.value })}
            error={refund.amount && refundInvalid ? `Enter an amount up to ${money(remaining, cur)}` : undefined}
            wrapperClassName="mb-4"
          />
        )}
        <Input label="Reason (shown in the timeline)" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} maxLength={300} wrapperClassName="mb-4" />
        {refund.mode === 'full' && <Checkbox label="Return all items to stock" checked={refund.restock} onChange={(v) => setRefund({ ...refund, restock: v })} />}
      </Dialog>

      <ConfirmDialog
        open={refundConfirm}
        onClose={() => setRefundConfirm(false)}
        onConfirm={() =>
          doRefund.mutate({
            amount: refund.mode === 'full' ? undefined : refundAmountMinor ?? undefined,
            reason: refund.reason || undefined,
            restock: refund.mode === 'full' && refund.restock,
          })
        }
        loading={doRefund.isPending}
        destructive
        title="Confirm refund"
        confirmLabel={`Refund ${money(refundAmountMinor ?? 0, cur)}`}
        body={`This sends ${money(refundAmountMinor ?? 0, cur)} back to ${order.customerName} through Stripe. It cannot be undone.`}
      />
    </>
  );
}

