// ========================================================================
// 🐶 Booking Room Payment Routes (Razorpay Integration)
// ========================================================================

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const BookingRoom = require("../models/BookingRoom"); 
const DogStay = require("../models/DogStay");
const auth = require("../middlewares/auth");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ========================================================================
// 🔐 Initialize Razorpay (Keys loaded from .env) + SERVER-SIDE CALCULATION
// ========================================================================
router.post("/create-order", async (req, res) => {
  try {
    const {
      listingId,
      checkInDate,
      checkOutDate,
      numDogs,
      fullName,
      email,
      mobile
    } = req.body;

    // 1. Core payload requirements validation
    if (!listingId || !checkInDate || !checkOutDate || !fullName || !email || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking details for order creation.",
      });
    }

    // 2. Authoritative Database Price Verification
    const room = await DogStay.findById(listingId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Room profile not found." });
    }

    const pricePerDay = Number(room.pricePerDay);
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      return res.status(400).json({ success: false, message: "Invalid room pricing data configuration." });
    }

    // 3. Strict chronological date checking bounds
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return res.status(400).json({ success: false, message: "Provided dates possess invalid formats." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkIn < today) {
      return res.status(400).json({ success: false, message: "Check-in cannot be set in historical/past contexts." });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({ success: false, message: "Check-out date must succeed check-in date." });
    }

    // 4. Compute verified amounts internally on the backend server
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const totalAmount = userPricePerDay * nights;

    const options = {
      amount: Math.round(totalAmount * 100),   // convert to paise (integer)
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({ success: true, order });

  } catch (error) {
    console.error("🔥 Create Order Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.error?.description || error?.message || "Something went wrong creating order",
    });
  }
});

// ========================================================================
// 📌 Route 2: VERIFY PAYMENT + SAVE BOOKING (SERVER-SIDE TRUTH COMPUTED)
// ========================================================================
router.post("/verify-payment", auth, async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      bookingData,
    } = req.body;

    if (!bookingData) {
      return res.status(400).json({ success: false, message: "Booking payload missing." });
    }

    // 1️⃣ Verify Signature Integrity
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

    // 2️⃣ Pull Authoritative Pricing metrics directly from Database via ID
    const room = await DogStay.findById(bookingData.listingId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Listing reference not found." });
    }

    const pricePerDay = Number(room.pricePerDay);
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      return res.status(400).json({ success: false, message: "Room parameters contain calculation errors." });
    }

    // Calculate nights cleanly
    const checkIn = new Date(bookingData.checkInDate);
    const checkOut = new Date(bookingData.checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    // Internal Calculations Engine (Do not trust parameters coming from frontend body)
    const fakePricePerDay = Math.round(pricePerDay * 1.20);
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const websiteCommissionPerDay = Math.round(pricePerDay * 0.10);
    const hostPricePerDay = Math.round(pricePerDay * 0.80);
    const totalAmount = userPricePerDay * nights;

    const pricingBreakup = { fakePricePerDay, userPricePerDay, websiteCommissionPerDay, hostPricePerDay };
    const totals = { nights, totalCommission: websiteCommissionPerDay * nights, totalHostEarning: hostPricePerDay * nights };

    // Format Mobile Value Context cleanly to string
    const cleanMobile = String(bookingData.mobile).replace(/[^\d]/g, "");

    // 3️⃣ Save Secure Whitelisted Booking Document to MongoDB
    const newBooking = new BookingRoom({      
      userId: req.user.id || req.user.mongoId,
      listingId: room._id,
      hostId: room.hostId,
      roomName: room.roomName,   

      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      numDogs: Number(bookingData.numDogs || 1),

      fullName: bookingData.fullName,
      email: bookingData.email,
      mobile: cleanMobile,

      pricePerDay,
      totalAmount,
      pricingBreakup,
      totals,
      
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
// 📌 Route 3: SAVE CASH BOOKING (SERVER-SIDE TRUTH COMPUTED)
// ========================================================================
router.post("/cash-booking", auth, async (req, res) => {
  try {
    const { bookingData } = req.body;

    if (!bookingData) {
      return res.status(400).json({
        success: false,
        message: "Booking data is missing."
      });
    }

    // 1️⃣ Pull Authoritative Pricing metrics directly from Database via ID
    const room = await DogStay.findById(bookingData.listingId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Listing reference not found." });
    }

    const pricePerDay = Number(room.pricePerDay);
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      return res.status(400).json({ success: false, message: "Room parameters contain calculation errors." });
    }

    // Calculate nights cleanly
    const checkIn = new Date(bookingData.checkInDate);
    const checkOut = new Date(bookingData.checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    // Internal Calculations Engine (Do not trust parameters coming from frontend body)
    const fakePricePerDay = Math.round(pricePerDay * 1.20);
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const websiteCommissionPerDay = Math.round(pricePerDay * 0.10);
    const hostPricePerDay = Math.round(pricePerDay * 0.80);
    const totalAmount = userPricePerDay * nights;

    const pricingBreakup = { fakePricePerDay, userPricePerDay, websiteCommissionPerDay, hostPricePerDay };
    const totals = { nights, totalCommission: websiteCommissionPerDay * nights, totalHostEarning: hostPricePerDay * nights };

    // Format Mobile Value Context cleanly to string
    const cleanMobile = String(bookingData.mobile).replace(/[^\d]/g, "");

    // 2️⃣ Create New Explicitly Whitelisted Booking Document
    const newBooking = new BookingRoom({
      userId: req.user.id || req.user.mongoId,
      listingId: room._id,
      hostId: room.hostId,
      roomName: room.roomName,

      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      numDogs: Number(bookingData.numDogs || 1),

      fullName: bookingData.fullName,
      email: bookingData.email,
      mobile: cleanMobile,

      pricePerDay,
      totalAmount,
      pricingBreakup,
      totals,

      paymentMethod: "Cash",
      paymentId: null,              // No Razorpay ID for cash
      paymentStatus: "pending",     // Cash is pending until arrival
      bookingStatus: "active"
    });

    // 3️⃣ Save to Database
    const savedBooking = await newBooking.save();

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