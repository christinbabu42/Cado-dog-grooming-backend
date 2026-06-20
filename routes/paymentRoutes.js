// ========================================================================
// 🐶 Booking Room Payment Routes (Razorpay Integration)
// ========================================================================

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const BookingRoom = require("../models/BookingRoom"); // ✅ Correct Model Imported
const auth = require("../middlewares/auth");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ========================================================================
// 🔐 Initialize Razorpay (Keys loaded from .env)
// ========================================================================
router.post("/create-order", async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;

    if (!amount) return res.status(400).json({ error: "Amount required" });

const options = {
  amount: Math.round(amount * 100),   // convert to paise (integer)
  currency: "INR",
  receipt: `rcpt_${Date.now()}`,
};

    const order = await razorpay.orders.create(options);

    return res.status(200).json({ success: true, order });

  } catch (error) {
    console.error("🔥 Create Order Error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.error?.description ||
        error?.message ||
        "Something went wrong creating order",
    });
  }
});

// ========================================================================
// 📌 Route 2: VERIFY PAYMENT + SAVE BOOKING
// ========================================================================
router.post("/verify-payment", auth, async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      bookingData,
    } = req.body;

    // 1️⃣ Verify Signature
    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }
console.log("📌 bookingData received =", bookingData);

    // 2️⃣ Save Booking to MongoDB
    const newBooking = new BookingRoom({      // ✅ FIXED: use BookingRoom instead of Booking
      userId:  req.user.mongoId,
      listingId: bookingData.listingId,
      hostId: bookingData.hostId,
      roomName: bookingData.roomName,   // ⭐ ADDED

      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      numDogs: bookingData.numDogs,

      fullName: bookingData.fullName,
      email: bookingData.email,
      mobile: bookingData.mobile,

      pricePerDay: bookingData.pricePerDay,
      additionalPetCharge: bookingData.additionalPetCharge,
      couponDiscount: bookingData.couponDiscount,
      instantDiscount: bookingData.instantDiscount,
      taxRate: bookingData.taxRate,
      totalAmount: bookingData.totalAmount,

        pricingBreakup: bookingData.pricingBreakup,
        totals: bookingData.totals,
      paymentMethod: "Card",
      paymentId: razorpay_payment_id,
      paymentStatus: "paid",
      bookingStatus: "active",
    });

    const savedBooking = await newBooking.save();

    return res.json({
      success: true,
      message: "Payment verified + Booking saved",
      booking: savedBooking,
    });

  } catch (error) {
    console.error("Verify Error:", error);

    return res.status(500).json({
      success: false,
      error: "Payment verification error",
    });
  }
});

// ========================================================================
// 📌 Route 3: SAVE CASH BOOKING (Payment Status: pending)
// ========================================================================
router.post("/cash-booking", auth, async (req, res) => {
  try {
    const { bookingData } = req.body;

    // ---------------------------------------------------------
    // Validate incoming request
    // ---------------------------------------------------------
    if (!bookingData) {
      return res.status(400).json({
        success: false,
        message: "Booking data is missing."
      });
    }

    // ---------------------------------------------------------
    // 1️⃣ Create New Booking Document
    // ---------------------------------------------------------
    const newBooking = new BookingRoom({
      userId:  req.user.mongoId,
      listingId: bookingData.listingId,
      hostId: bookingData.hostId,
      roomName: bookingData.roomName,

      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      numDogs: bookingData.numDogs,

      fullName: bookingData.fullName,
      email: bookingData.email,
      mobile: bookingData.mobile,

      pricePerDay: bookingData.pricePerDay,
      additionalPetCharge: bookingData.additionalPetCharge,
      couponDiscount: bookingData.couponDiscount,
      instantDiscount: bookingData.instantDiscount,
      taxRate: bookingData.taxRate,
      totalAmount: bookingData.totalAmount,

        pricingBreakup: bookingData.pricingBreakup,
        totals: bookingData.totals,

      // -----------------------------------------------------
      // ⭐ CASH PAYMENT DETAILS
      // -----------------------------------------------------
      paymentMethod: "Cash",
      paymentId: null,              // No Razorpay ID for cash
      paymentStatus: "pending",     // Cash is pending until arrival
      bookingStatus: "active"
    });

    // ---------------------------------------------------------
    // 2️⃣ Save to Database
    // ---------------------------------------------------------
    const savedBooking = await newBooking.save();

    // ---------------------------------------------------------
    // 3️⃣ Response
    // ---------------------------------------------------------
    return res.json({
      success: true,
      message: "Cash Booking saved with payment pending status",
      booking: savedBooking
    });

  } catch (error) {
    console.error("Cash Booking Error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to save cash booking"
    });
  }
});

// ========================================================================
// 📤 Export Router
// ========================================================================
module.exports = router;
