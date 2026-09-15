// One-off repair: backfill 3% tax markers on escrow released by the legacy
// functions releaseEscrow (which credited full netAmount without tax).
// Finds paid payments whose booking is completed but which lack
// taxWithheldAt/payoutAmount, then adjusts the teacher wallet by the tax delta.
//
// DRY-RUN by default. Apply with --apply. Refuses production unless the Admin
// key file is present (same guard as other scripts).
//
// Run:
//   node scripts/repair-escrow-tax.cjs            # dry-run, report only
//   node scripts/repair-escrow-tax.cjs --apply    # write fixes
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');
const APPLY = process.argv.includes('--apply');
const TAX_RATE = 0.03;

async function main() {
  const app = admin.initializeApp({ credential: admin.credential.cert(KEY_FILE) });
  const db = getFirestore(app, 'tutor');

  const paymentsSnap = await db.collection('payments').where('status', '==', 'paid').limit(1000).get();
  console.log(`scanning ${paymentsSnap.size} paid payments (dry-run=${!APPLY})`);

  let candidates = 0;
  let fixed = 0;
  for (const doc of paymentsSnap.docs) {
    const p = doc.data();
    if (p.taxWithheldAt !== undefined || p.payoutAmount !== undefined) continue;
    const bookingSnap = p.bookingId ? await db.collection('bookings').doc(p.bookingId).get() : null;
    const bookingStatus = bookingSnap?.exists ? bookingSnap.data().status : null;
    if (bookingStatus !== 'completed') continue;
    const netAmount = Number(p.netAmount) || 0;
    if (!p.teacherId || netAmount <= 0) continue;

    candidates += 1;
    const taxWithheld = Math.round(netAmount * TAX_RATE * 100) / 100;
    const payoutAmount = netAmount - taxWithheld;
    console.log(`- payment ${doc.id}: net=${netAmount} tax=${taxWithheld} payout=${payoutAmount} teacher=${p.teacherId}`);

    if (!APPLY) continue;
    // Wallet was credited full net by legacy code; correct by the tax delta.
    await doc.ref.update({
      taxWithheld,
      payoutAmount,
      taxWithheldAt: FieldValue.serverTimestamp(),
      escrowTaxBackfilled: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const walletRef = db.collection('wallets').doc(p.teacherId);
    const walletSnap = await walletRef.get();
    if (walletSnap.exists) {
      await walletRef.update({
        availableBalance: FieldValue.increment(-taxWithheld),
        totalEarned: FieldValue.increment(-taxWithheld),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    fixed += 1;
  }

  console.log(`\ncandidates=${candidates} fixed=${fixed}${APPLY ? '' : ' (dry-run — rerun with --apply to write)'}`);
  await app.delete();
}

main().catch((err) => {
  console.error('Repair error:', err);
  process.exit(1);
});
