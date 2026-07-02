const express = require("express");
const GroomerBooking = require("../models/GroomerBooking");
const calculateDistanceKm = require("../utils/calculateDistance");
const User = require("../models/User");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const auth = require("../middlewares/auth"); 
const BookingRoom = require("../models/BookingRoom"); 
const GroomingStaff = require("../models/GroomingStaff");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Detect environment context
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// =========================================================
// 🛡️ SECURITY: RATE LIMITERS FOR SENSITIVE ENDPOINTS
// =========================================================
const orderRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 25, 
  message: { message: "Too many booking attempts from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, 
  message: { message: "Spam protection triggered. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// =========================================================
// 🔒 REUSABLE STRICTOR VALIDATION ENGINE & PRICING TRUTH
// =========================================================
const getVerifiedPricing = async (service, dogSize, petCount, staffID, userLat, userLng) => {
  const allowedServices = ["Basic Bath", "Basic Grooming", "Advanced Grooming"];
  const allowedSizes = ["Medium (<10kg)", "Large (10-25kg)", "Maximum (>25kg)"];

  if (!allowedServices.includes(service) || !allowedSizes.includes(dogSize)) {
    throw new Error("Invalid service type or pet size specified.");
  }

  const parsedPetCount = Number(petCount);
  if (isNaN(parsedPetCount) || parsedPetCount < 1 || parsedPetCount > 5) {
    throw new Error("Pet count must be an integer between 1 and 5.");
  }

  const latNum = Number(userLat);
  const lngNum = Number(userLng);
  if (isNaN(latNum) || latNum < -90 || latNum > 90 || isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    throw new Error("Invalid GPS coordinates provided.");
  }

  const prices = {
    "Basic Bath": {
      "Medium (<10kg)": 600,
      "Large (10-25kg)": 800,
      "Maximum (>25kg)": 1000
    },
    "Basic Grooming": {
      "Medium (<10kg)": 1200,
      "Large (10-25kg)": 1600,
      "Maximum (>25kg)": 1800
    },
    "Advanced Grooming": {
      "Medium (<10kg)": 1600,
      "Large (10-25kg)": 2000,
      "Maximum (>25kg)": 2200
    }
  };

  const basePriceUnit = prices[service][dogSize];
  const servicePrice = basePriceUnit * parsedPetCount;

  // ❌ Fix 3: Wrap debug logs based on production status flags
  if (!IS_PRODUCTION) {
    console.log("getVerifiedPricing -> lookup staffID =", staffID);
  }

  const staff = await GroomingStaff.findOne({ staffID });
  
  if (!IS_PRODUCTION) {
    console.log("getVerifiedPricing -> found staff object =", staff);
  }

  if (!staff || !staff.location || !staff.location.lat) {
    throw new Error(`Grooming staff or base location info not found for ID: ${staffID}`);
  }
  
  if (staff.active === false || staff.isDeleted === true) {
    throw new Error("The requested grooming professional is currently unavailable.");
  }

  const distanceKm = calculateDistanceKm(
    staff.location.lat,
    staff.location.lng,
    latNum,
    lngNum
  );

  const ratePerKm = 15; 
  const travelCharge = Math.round(distanceKm * ratePerKm);
  const finalAmount = servicePrice + travelCharge;

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    travelCharge,
    servicePrice,
    finalAmount
  };
};

// =========================================================
// 🚀 CALCULATE TRAVEL DISTANCE (Protected Route)
// =========================================================
router.post("/calculate-travel", auth, async (req, res) => {
  try {
    const { staffID, service, dogSize, petCount, userLat, userLng } = req.body;

    if (!staffID || !service || !dogSize || !userLat || !userLng) {
      return res.status(400).json({ message: "Missing required service parameters or coordinates" });
    }

    const verifiedCalculations = await getVerifiedPricing(service, dogSize, petCount, staffID, userLat, userLng);

    res.json({
      success: true,
      distanceKm: verifiedCalculations.distanceKm,
      travelCharge: verifiedCalculations.travelCharge,
      finalAmount: verifiedCalculations.finalAmount
    });

  } catch (err) {
    console.error("Travel computation handler crash:", err);
    res.status(400).json({ message: err.message || "Internal distance matrix handler failure" });
  }
});

// =========================================================
// CREATE ORDER FOR ONLINE PAYMENT (Protected + Rate Limited)
// =========================================================
router.post("/create-order", auth, orderRateLimiter, async (req, res) => {
  // ❌ Fix 3: Environment sensitive runtime diagnostic logging
  if (!IS_PRODUCTION) {
    console.log("Inbound payload at /create-order:", req.body);
  }

  try {
    const { service, dogSize, petCount, staffID, userLat, userLng } = req.body;

    if (!staffID || !service || !dogSize || !userLat || !userLng) {
      return res.status(400).json({ message: "Missing required order specification details" });
    }

    const { finalAmount } = await getVerifiedPricing(service, dogSize, petCount, staffID, userLat, userLng);

    const order = await razorpay.orders.create({
      amount: finalAmount * 100,
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    });

    res.json({
      success: true,
      order,
      finalAmount
    });

  } catch (err) {
    console.error("Create order error:", err);
    res.status(400).json({ message: err.message || "Order creation failed" });
  }
});

// =========================================================
// FETCH SPECIFIC GROOMER STAFF
// =========================================================
router.get("/:id", async (req, res) => {
  try {
    const staff = await GroomingStaff.findOne({ staffID: req.params.id });

    if (!staff) {
      return res.status(404).json({ success: false, message: "Staff not found" });
    }

    res.json({ success: true, staff });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =========================================================
// 🔒 HIGH-SECURITY UPDATE: VERIFY PAYMENT + SAVE BOOKING
// =========================================================
router.post("/verify-payment", auth, paymentRateLimiter, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      form
    } = req.body;

    // 1. Check signature validity matching secret key rules first
    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid cryptographic signature detected." });
    }

    // ❌ Fix 2: Idempotency & Replay Attack Defense (Check for duplicate payment entries)
    const exactDuplicateBooking = await GroomerBooking.findOne({ paymentId: razorpay_payment_id });
    if (exactDuplicateBooking) {
      return res.status(409).json({ success: true, message: "Booking already tracked.", booking: exactDuplicateBooking });
    }

    // Force strict backend validation recalculation
    const pricingTruth = await getVerifiedPricing(
      form.service,
      form.dogSize,
      form.petCount,
      form.staffID,
      form.lat,
      form.lng
    );

    // ❌ Fix 1: Deep verification loop query against the direct Razorpay API service
    const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
    
    if (!paymentDetails || paymentDetails.status !== "captured") {
      return res.status(402).json({ success: false, message: "Payment status must be authorized and captured." });
    }

    // Cross-verify that the API amount paid exactly equals backend calculations (in paise)
    const expectedPaiseAmount = pricingTruth.finalAmount * 100;
    if (Number(paymentDetails.amount) !== expectedPaiseAmount) {
      return res.status(422).json({ success: false, message: "Payment amount discrepancy matched against system calculation values." });
    }

    const verifiedUser = await User.findById(req.user.id);
    if (!verifiedUser) {
      return res.status(404).json({ success: false, message: "Authorized user not found." });
    }

    const commissionPercent = 20;
    const commissionAmount = Math.round((pricingTruth.finalAmount * commissionPercent) / 100);
    const staffEarning = pricingTruth.finalAmount - commissionAmount;

    const booking = new GroomerBooking({
      ...form,
      userId: verifiedUser._id,     
      name: verifiedUser.name,       
      phone: verifiedUser.phone,     
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffID, 
      staffName: form.staffName,
      staffLocation: form.staffLocation,
      distanceKm: pricingTruth.distanceKm,
      travelCharge: pricingTruth.travelCharge,
      finalAmount: pricingTruth.finalAmount,
      paymentMethod: "Online",
      paymentStatus: "paid",
      paymentId: razorpay_payment_id,
      commissionPercent,
      commissionAmount,
      staffEarning
    });

    await booking.save();
    res.json({ success: true, booking });

  } catch (err) {
    console.error("Payment verify error:", err);
    res.status(400).json({ success: false, message: err.message || "Payment verification failure" });
  }
});

// =========================================================
// 🔒 CASH PAYMENT (Protected + Rate Limited)
// =========================================================
router.post("/cash-payment", auth, paymentRateLimiter, async (req, res) => {
  try {
    const {
      distanceKm,       
      travelCharge,     
      finalAmount,      
      ...form
    } = req.body;

    const pricingTruth = await getVerifiedPricing(
      form.service,
      form.dogSize,
      form.petCount,
      form.staffID,
      form.lat,
      form.lng
    );

    // ❌ Fix 2: Simple deduplication for accidental fast clicks on cash submit profiles
    const prospectiveDuplicate = await GroomerBooking.findOne({
      userId: req.user.id,
      service: form.service,
      staffId: form.staffID,
      createdAt: { $gte: new Date(Date.now() - 10000) } // Flag matching bookings submitted in the last 10 seconds
    });

    if (prospectiveDuplicate) {
      return res.status(409).json({ success: true, message: "Processing active checkout request, avoiding entry duplicates.", booking: prospectiveDuplicate });
    }

    const verifiedUser = await User.findById(req.user.id);
    if (!verifiedUser) {
      return res.status(404).json({ success: false, message: "Authorized user not found." });
    }

    const commissionPercent = 20;
    const commissionAmount = Math.round((pricingTruth.finalAmount * commissionPercent) / 100);
    const staffEarning = pricingTruth.finalAmount - commissionAmount;

    const booking = new GroomerBooking({
      ...form,
      userId: verifiedUser._id,     
      name: verifiedUser.name,       
      phone: verifiedUser.phone,     
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffID, 
      staffName: form.staffName,
      staffLocation: form.staffLocation,
      distanceKm: pricingTruth.distanceKm,
      travelCharge: pricingTruth.travelCharge,
      finalAmount: pricingTruth.finalAmount,
      paymentMethod: "Cash",
      paymentStatus: "pending",
      commissionPercent,
      commissionAmount,
      staffEarning
    });

    await booking.save();
    res.json({ success: true, booking });

  } catch (err) {
    console.error("Cash booking error:", err);
    res.status(400).json({ success: false, message: err.message || "Cash booking creation failure" });
  }
});

// =========================================================
// GET ALL GROOMER BOOKINGS (for admin)
// =========================================================
router.get("/all-bookings", async (req, res) => {
  try {
    const bookings = await GroomerBooking.find().sort({ createdAt: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    console.error("Error fetching bookings:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =========================================================
// GET SINGLE BOOKING DETAILS
// =========================================================
router.get("/details/:id", async (req, res) => {
  try {
    const booking = await GroomerBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false });
    }
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// =========================================================
// DELETE A GROOMER BOOKING BY ID
// =========================================================
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await GroomerBooking.findById(id);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    await GroomerBooking.findByIdAndDelete(id);
    res.json({ success: true, message: "Booking deleted successfully" });
  } catch (err) {
    console.error("Error deleting groomer booking:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =========================================================
// GET STAFF EARNINGS (WITH DATE RANGE FILTER)
// =========================================================
router.get("/staff/earnings/:staffId", auth, async (req, res) => {
  try {
    const { staffId } = req.params;
    const { range } = req.query;

    let startDate = null;
    const now = new Date();

    switch (range) {
      case "today":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case "1week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "1month":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "6months":
        startDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      case "1year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = null;
    }

    const query = {
      staffId,
      paymentStatus: "paid",
    };

    if (startDate) {
      query.createdAt = { $gte: startDate };
    }

    const bookings = await GroomerBooking.find(query).sort({ createdAt: -1 });

    const totalBookings = bookings.length;
    const totalRevenue = bookings.reduce((s, b) => s + (b.finalAmount || 0), 0);
    const totalCommission = bookings.reduce((s, b) => s + (b.commissionAmount || 0), 0);
    const totalEarning = bookings.reduce((s, b) => s + (b.staffEarning || 0), 0);

    res.json({
      success: true,
      stats: {
        totalBookings,
        totalRevenue,
        totalCommission,
        totalEarning,
      },
      recentBookings: bookings.slice(0, 10),
    });

  } catch (err) {
    console.error("Staff earnings error:", err);
    res.status(500).json({ success: false, message: "Earnings fetch execution error" });
  }
});

module.exports = router;