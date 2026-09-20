'use strict';

// Entitlement is derived from confirmed orders in `payments`, so the owner's
// plan is granted as an order rather than a field on the user document.
const OwnerEmail = (process.env.OWNER_EMAIL || 'mrrajeev18@gmail.com').trim().toLowerCase();
const OrderId = 'admin-master-owner';

module.exports = {
  id: '0001_owner_master_subscription',
  description: 'Grant the owner a lifetime master subscription',
  async up({ container, log }) {
    const payments = await container('payments');
    const now = Date.now();
    await payments.items.upsert({
      id: OrderId,
      type: 'order',
      tier: 'master',
      email: OwnerEmail,
      baseAmount: 999,
      payAmount: 999,
      status: 'confirmed',
      utr: 'admin-lifetime',
      receiptId: null,
      createdAt: now,
      confirmedAt: now,
      seq: 1,
      grantedBy: 'admin-lifetime',
      lifetime: true,
    });
    log(`granted lifetime master to ${OwnerEmail}`);
  },
};
