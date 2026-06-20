const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const BookingRoom = require("../models/BookingRoom");

const Razorpay = require("razorpay");
const crypto = require("crypto");

// GET RAZORPAY KEY
router.get("/razorpay-key", (req, res) => {
  res.json({
    success: true,
    key: process.env.RAZORPAY_KEY_ID
  });
});

// ✅ HOST COMMISSION DATA

router.get("/:hostId", async (req, res) => {
  try {
    const { hostId } = req.params;

    // ✅ Validate ObjectId first
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hostId"
      });
    }

    const hostObjectId = new mongoose.Types.ObjectId(hostId);

    console.log("🔍 Fetching commission for host:", hostObjectId);

    const bookings = await BookingRoom.find({
      hostId: hostObjectId,
      paymentMethod: "Cash",
      bookingStatus: { $ne: "cancelled" },
      commissionPaid: { $ne: true } // ✅ IMPORTANT
    }).sort({ createdAt: -1 });

    console.log("📦 Bookings found:", bookings.length);

    let totalCashCommission = 0;
    let pendingCommission = 0;
    let totalProfit = 0;

    const commissionBookings = bookings.filter(
      b => (b?.totals?.totalCommission || 0) > 0
    );

    commissionBookings.forEach(b => {
      const commission = b.totals?.totalCommission || 0;
      const profit = b.totals?.totalHostEarning || 0;

      totalCashCommission += commission;
      pendingCommission += commission;
      totalProfit += profit;
    });

    console.log("💰 SUMMARY:", {
      totalCashCommission,
      pendingCommission,
      totalProfit
    });

    res.json({
      success: true,
      summary: {
        totalCashCommission,
        pendingCommission,
        totalProfit
      },
      bookings: commissionBookings
    });

  } catch (err) {
    console.error("❌ Host Commission Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
});





//razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


//razorpay
router.post("/create-order", async (req, res) => {
  try {
    const { amount, hostId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: `comm_${Date.now()}` // ✅ FIXED
    });

    res.json({
      success: true,
      order
    });

  } catch (err) {
    console.error("❌ Razorpay Order Error:", err);
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
});


// 🔐 VERIFY PAYMENT
router.post("/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      hostId
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    // ✅ DEDUCT COMMISSION (LOGICALLY)
    await BookingRoom.updateMany(
      {
        hostId,
        paymentMethod: "Cash",
        commissionPaid: { $ne: true }
      },
      {
        $set: {
          commissionPaid: true,
          commissionPaidAt: new Date(),
          paymentStatus: "paid",
          paymentId: razorpay_payment_id
        }
      }
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ success: false });
  }
});



module.exports = router;
