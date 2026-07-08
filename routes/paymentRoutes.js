// ========================================================================
// 🐶 Booking Room Payment Routes (Razorpay Integration)
// ========================================================================

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const BookingRoom = require("../models/BookingRoom"); // ✅ Correct Model Imported
const DogStay = require("../models/DogStay");         // ✅ Added for Authoritative Pricing
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
  console.log("BODY =", req.body);
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

    // Diagnostic logging for Step 2
    console.log("VALIDATION FIELDS CHECK:", {
      listingId,
      checkInDate,
      checkOutDate,
      numDogs,
      fullName,
      email,
      mobile
    });

    // 1️⃣ Validate core payload availability
    if (!listingId || !checkInDate || !checkOutDate || !fullName || !email || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking details for order creation.",
      });
    }

    // 2️⃣ Fetch authoritative data record to compute price server-side
    const room = await DogStay.findById(listingId);
    console.log("ROOM =", room); // Diagnostic logging for Step 3

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room profile not found",
      });
    }

    const pricePerDay = Number(room.pricePerDay);
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid room pricing configuration data.",
      });
    }

    // 3️⃣ Enforce strict chronological verification
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid date timestamp formats." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Diagnostic logging for Step 4
    console.log("CheckIn =", checkIn);
    console.log("CheckOut =", checkOut);
    console.log("Today =", today);

    if (checkIn < today) {
      return res.status(400).json({ success: false, message: "Check-in cannot be processed in past contexts." });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({ success: false, message: "Check-out date must succeed check-in date." });
    }

    // 4️⃣ Execute algorithmic internal pricing snapshot formulas
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const totalAmount = userPricePerDay * nights;

    // Diagnostic logging for Step 5
    console.log("PRICING BREAKDOWN CALCULATED:", {
      nights,
      pricePerDay,
      totalAmount
    });

    const options = {
      amount: Math.round(totalAmount * 100),   // convert to paise (integer)
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({ success: true, order });

  } catch (error) {
    // Diagnostic logging updates for Step 6
    console.error("FULL ERROR");
    console.error(error);
    console.error(error?.error);
    console.error(error?.response?.data);

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

    // Pull database metrics truth dynamically to construct calculation vectors safely
    const room = await DogStay.findById(bookingData.listingId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Listing context reference not found." });
    }

    const pricePerDay = Number(room.pricePerDay);
    const checkIn = new Date(bookingData.checkInDate);
    const checkOut = new Date(bookingData.checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    const fakePricePerDay = Math.round(pricePerDay * 1.20);
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const websiteCommissionPerDay = Math.round(pricePerDay * 0.10);
    const hostPricePerDay = Math.round(pricePerDay * 0.80);
    const totalAmount = userPricePerDay * nights;

    const computedPricingBreakup = { fakePricePerDay, userPricePerDay, websiteCommissionPerDay, hostPricePerDay };
    const computedTotals = { nights, totalCommission: websiteCommissionPerDay * nights, totalHostEarning: hostPricePerDay * nights };

    // 2️⃣ Save Booking to MongoDB
    const newBooking = new BookingRoom({      // ✅ FIXED: use BookingRoom instead of Booking
      userId:  req.user.mongoId || req.user.id,
      listingId: room._id,
      hostId: room.hostId,
      roomName: room.roomName,   // ⭐ ADDED

      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      numDogs: Number(bookingData.numDogs || 1),

      fullName: bookingData.fullName,
      email: bookingData.email,
      mobile: String(bookingData.mobile).replace(/[^\d]/g, ""),

      pricePerDay,
      additionalPetCharge: bookingData.additionalPetCharge || 0,
      couponDiscount: bookingData.couponDiscount || 0,
      instantDiscount: bookingData.instantDiscount || 0,
      taxRate: bookingData.taxRate || 0,
      totalAmount,

      pricingBreakup: computedPricingBreakup,
      totals: computedTotals,
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

    // Pull database metrics truth dynamically to construct calculation vectors safely
    const room = await DogStay.findById(bookingData.listingId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Listing context reference not found." });
    }

    const pricePerDay = Number(room.pricePerDay);
    const checkIn = new Date(bookingData.checkInDate);
    const checkOut = new Date(bookingData.checkOutDate);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

    const fakePricePerDay = Math.round(pricePerDay * 1.20);
    const userPricePerDay = Math.round(pricePerDay * 0.90);
    const websiteCommissionPerDay = Math.round(pricePerDay * 0.10);
    const hostPricePerDay = Math.round(pricePerDay * 0.80);
    const totalAmount = userPricePerDay * nights;

    const computedPricingBreakup = { fakePricePerDay, userPricePerDay, websiteCommissionPerDay, hostPricePerDay };
    const computedTotals = { nights, totalCommission: websiteCommissionPerDay * nights, totalHostEarning: hostPricePerDay * nights };

    // ---------------------------------------------------------
    // 1️⃣ Create New Booking Document
    // ---------------------------------------------------------
    const newBooking = new BookingRoom({
      userId:  req.user.mongoId || req.user.id,
      listingId: room._id,
      hostId: room.hostId,
      roomName: room.roomName,

      checkInDate: bookingData.checkInDate,
      checkOutDate: bookingData.checkOutDate,
      numDogs: Number(bookingData.numDogs || 1),

      fullName: bookingData.fullName,
      email: bookingData.email,
      mobile: String(bookingData.mobile).replace(/[^\d]/g, ""),

      pricePerDay,
      additionalPetCharge: bookingData.additionalPetCharge || 0,
      couponDiscount: bookingData.couponDiscount || 0,
      instantDiscount: bookingData.instantDiscount || 0,
      taxRate: bookingData.taxRate || 0,
      totalAmount,

      pricingBreakup: computedPricingBreakup,
      totals: computedTotals,

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
// 📊 ADMINISTRATIVE ROUTE 4: FETCH ALL BOOKINGS (For PaymentsPage Dashboard)
// ========================================================================
router.get("/all-payments", auth, async (req, res) => {
  try {
    // Fetches all the records from BookingRoom collection sorted by latest first
    const bookings = await BookingRoom.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error("Fetch All Payments Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch administrative payment dashboards."
    });
  }
});

// ========================================================================
// 🗑️ ADMINISTRATIVE ROUTE 5: DELETE A BOOKING RECORD
// ========================================================================
router.delete("/delete/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRecord = await BookingRoom.findByIdAndDelete(id);

    if (!deletedRecord) {
      return res.status(404).json({
        success: false,
        message: "Booking record reference targeted does not exist."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Booking record successfully deleted"
    });
  } catch (error) {
    console.error("Delete Booking Route Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete booking context."
    });
  }
});

// ========================================================================
// 📤 Export Router
// ========================================================================
module.exports = router;