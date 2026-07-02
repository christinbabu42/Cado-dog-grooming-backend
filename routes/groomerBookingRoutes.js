const express = require("express");
const GroomerBooking = require("../models/GroomerBooking");
const calculateDistanceKm = require("../utils/calculateDistance");
const User = require("../models/User");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const auth = require("../middlewares/auth"); 
const BookingRoom = require("../models/BookingRoom"); 
const GroomingStaff = require("../models/GroomingStaff");

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// =========================================================
// 🔒 REUSABLE BACKEND PRICING TRUTH ENGINE
// =========================================================
const getVerifiedPricing = async (service, dogSize, petCount, staffID, userLat, userLng) => {
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

  // Find base pricing from secure dictionary
  const basePriceUnit = prices[service]?.[dogSize] || 0;
  const servicePrice = basePriceUnit * Number(petCount || 1);

  // Query database for authoritative staff baseline parameters
  const staff = await GroomingStaff.findOne({ staffID });
  if (!staff || !staff.location || !staff.location.lat) {
    throw new Error("Grooming staff or base location info not found");
  }

  const distanceKm = calculateDistanceKm(
    staff.location.lat,
    staff.location.lng,
    Number(userLat),
    Number(userLng)
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
// 🚀 UPDATED: CALCULATE TRAVEL DISTANCE (Protected Route)
// =========================================================
router.post("/calculate-travel", auth, async (req, res) => {
  try {
    const { staffID, service, dogSize, petCount, userLat, userLng } = req.body;

    if (!staffID || !service || !dogSize || !userLat || !userLng) {
      return res.status(400).json({ message: "Missing required service parameters or coordinates" });
    }

    // Process earth geometry calculations securely based on parameters
    const verifiedCalculations = await getVerifiedPricing(service, dogSize, petCount, staffID, userLat, userLng);

    res.json({
      success: true,
      distanceKm: verifiedCalculations.distanceKm,
      travelCharge: verifiedCalculations.travelCharge,
      finalAmount: verifiedCalculations.finalAmount
    });

  } catch (err) {
    console.error("Travel computation handler crash:", err);
    res.status(500).json({ message: err.message || "Internal distance matrix handler failure" });
  }
});

// =========================================================
// UPDATED: CREATE ORDER FOR ONLINE PAYMENT
// =========================================================
router.post("/create-order", auth, async (req, res) => {
  try {
    const { service, dogSize, petCount, staffID, userLat, userLng } = req.body;

    if (!staffID || !service || !dogSize || !userLat || !userLng) {
      return res.status(400).json({ message: "Missing required order specification details" });
    }

    // Enforce business pricing generation matching database truth values
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
    res.status(500).json({ message: "Order creation failed" });
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
// UPDATED: VERIFY PAYMENT + SAVE BOOKING
// =========================================================
router.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      form
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res.json({ success: false, message: "Invalid signature" });
    }

    // Force strict backend validation calculation engine override
    const pricingTruth = await getVerifiedPricing(
      form.service,
      form.dogSize,
      form.petCount,
      form.staffID,
      form.lat,
      form.lng
    );

    const commissionPercent = 20;
    const commissionAmount = Math.round((pricingTruth.finalAmount * commissionPercent) / 100);
    const staffEarning = pricingTruth.finalAmount - commissionAmount;

    const booking = new GroomerBooking({
      ...form,
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffId,
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
    res.status(500).json({ success: false });
  }
});

// =========================================================
// UPDATED: CASH PAYMENT (NO RAZORPAY)
// =========================================================
router.post("/cash-payment", async (req, res) => {
  try {
    const {
      distanceKm,       // Excluded destructured items sent by clients
      travelCharge,     // Excluded destructured items sent by clients
      finalAmount,      // Excluded destructured items sent by clients
      ...form
    } = req.body;

    // Build internal pricing matrix properties securely via truth handler
    const pricingTruth = await getVerifiedPricing(
      form.service,
      form.dogSize,
      form.petCount,
      form.staffID,
      form.lat,
      form.lng
    );

    const commissionPercent = 20;
    const commissionAmount = Math.round((pricingTruth.finalAmount * commissionPercent) / 100);
    const staffEarning = pricingTruth.finalAmount - commissionAmount;

    const booking = new GroomerBooking({
      ...form,
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffId,
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
    res.status(500).json({ success: false });
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