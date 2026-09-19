const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { isBkashConfigured, createPayment, executePayment } = require("../utils/bkash");
const { createNotification } = require("../utils/notify");

// Total unpaid fines for the logged-in student
router.get(
  "/my-balance",
  requireAuth,
  asyncHandler(async (req, res) => {
    const unpaid = await Transaction.find({ user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } });
    const total = unpaid.reduce((sum, t) => sum + t.fineAmount, 0);
    res.json({ total, count: unpaid.length, bkashAvailable: isBkashConfigured() });
  })
);

// Start a bKash payment for all outstanding fines. Requires BKASH_* env vars
// (see utils/bkash.js) — otherwise returns a clear "not configured" error so
// the frontend can point the student to the librarian instead.
router.post(
  "/bkash/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isBkashConfigured()) {
      return res.status(503).json({
        error: "Online payment isn't set up yet. Please settle your fine with the librarian at the desk.",
      });
    }

    const unpaid = await Transaction.find({ user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } });
    const total = unpaid.reduce((sum, t) => sum + t.fineAmount, 0);
    if (total <= 0) return res.status(400).json({ error: "You have no outstanding fines." });

    const invoiceNumber = `LMS-${req.user.id}-${Date.now()}`;
    const callbackURL = `${process.env.APP_URL || "http://localhost:3000"}/payment-callback.html`;

    const payment = await createPayment({ amount: total, invoiceNumber, callbackURL });
    res.json({ paymentID: payment.paymentID, bkashURL: payment.bkashURL, amount: total });
  })
);

// bKash redirects the user back here after they approve/cancel in the bKash
// app/web flow; the frontend calls this to finalize and mark fines paid.
router.post(
  "/bkash/execute",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { paymentID } = req.body;
    if (!paymentID) return res.status(400).json({ error: "Missing paymentID" });

    const result = await executePayment(paymentID);
    if (result.transactionStatus !== "Completed") {
      return res.status(400).json({ error: "Payment was not completed.", detail: result.statusMessage });
    }

    await Transaction.updateMany(
      { user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } },
      { finePaid: true }
    );
    await createNotification(req.user.id, "fine", `Payment received — your fines are cleared. (bKash txn: ${result.trxID})`);

    res.json({ message: "Payment successful. Your fines are cleared.", trxID: result.trxID });
  })
);

module.exports = router;
