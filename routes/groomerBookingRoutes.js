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
// 🚀 NEW: CALCULATE TRAVEL DISTANCE (Protected Route)
// =========================================================
router.post("/calculate-travel", auth, async (req, res) => {
  try {
    const { staffID, servicePrice, userLat, userLng } = req.body;

    if (!staffID || !userLat || !userLng) {
      return res.status(400).json({ message: "Missing required coordinates or staff parameters" });
    }

    const staff = await GroomingStaff.findOne({ staffID });
    if (!staff || !staff.location || !staff.location.lat) {
      return res.status(404).json({ message: "Grooming staff or base location info not found" });
    }

    // Process earth geometry mapping distance logic
    const distanceKm = calculateDistanceKm(
      staff.location.lat,
      staff.location.lng,
      userLat,
      userLng
    );

    // Calculate dynamic premiums based on your system business rules
    const ratePerKm = 15; 
    const travelCharge = Math.round(distanceKm * ratePerKm);
    const finalAmount = Number(servicePrice) + travelCharge;

    res.json({
      success: true,
      distanceKm: Math.round(distanceKm * 10) / 10,
      travelCharge,
      finalAmount
    });

  } catch (err) {
    console.error("Travel computation handler crash:", err);
    res.status(500).json({ message: "Internal distance matrix handler failure" });
  }
});

// =========================================================
// CREATE ORDER FOR ONLINE PAYMENT
// =========================================================
router.post("/create-order", auth, async (req, res) => {
  try {
    const { finalAmount } = req.body;

    if (!finalAmount) {
      return res.status(400).json({ message: "finalAmount is required" });
    }

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
// VERIFY PAYMENT + SAVE BOOKING
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

    const commissionPercent = 20;
    const commissionAmount = Math.round((form.finalAmount * commissionPercent) / 100);
    const staffEarning = form.finalAmount - commissionAmount;

    const booking = new GroomerBooking({
      ...form,
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffId,
      staffName: form.staffName,
      staffLocation: form.staffLocation,
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
// CASH PAYMENT (NO RAZORPAY)
// =========================================================
router.post("/cash-payment", async (req, res) => {
  try {
    const {
      distanceKm,
      travelCharge,
      finalAmount,
      ...form
    } = req.body;

    const commissionPercent = 20;
    const commissionAmount = Math.round((finalAmount * commissionPercent) / 100);
    const staffEarning = finalAmount - commissionAmount;

    const booking = new GroomerBooking({
      ...form,
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffId,
      staffName: form.staffName,
      staffLocation: form.staffLocation,
      distanceKm,
      travelCharge,
      finalAmount,
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