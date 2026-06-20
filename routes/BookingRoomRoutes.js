const express = require("express");
const router = express.Router();
const BookingRoom = require("../models/BookingRoom");
const Transaction = require("../models/Transaction");
const Service = require("../models/Review");
const auth = require("../middlewares/auth");
const GroomerBooking = require("../models/GroomerBooking");


// ========================================================================
// ✅ Get all payments (DogStay + Groomer)
// ========================================================================
router.get("/all-payments", auth, async (req, res) => {
  try {
    const dogstayBookings = await BookingRoom.find()
      .populate("userId", "name email")
      .populate("listingId", "roomName")
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    const groomerBookings = await GroomerBooking.find()
      .sort({ createdAt: -1 });

    const combined = [
      ...dogstayBookings.map(b => ({
        _id: b._id,
        fullName: b.userId?.name || b.fullName || "N/A",
        roomName: b.listingId?.roomName || b.roomName || "DogStay",
        totalAmount: b.totalAmount || 0,
        paymentMethod: b.paymentMethod || "N/A",
        paymentStatus: b.bookingStatus || b.paymentStatus || "pending",
        createdAt: b.createdAt
      })),
      ...groomerBookings.map(b => ({
        _id: b._id,
        fullName: b.name || "N/A",
        roomName: b.service || "Grooming",
        totalAmount: b.price || 0,
        paymentMethod: b.paymentMethod || "N/A",
        paymentStatus: b.paymentStatus || "pending",
        createdAt: b.createdAt
      }))
    ];

    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, bookings: combined });

  } catch (err) {
    console.error("Error fetching all payments:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ========================================================================
// 🟢 Create a new booking (SAFE EXTENSION ONLY)
// ========================================================================
router.post("/", async (req, res) => {
  try {
    const {
      userId,
      hostId,
      listingId,
      roomName,
      checkInDate,
      checkOutDate,
      pricePerDay,
      totalAmount
    } = req.body;

    if (!userId || !hostId || !listingId || !roomName || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // ==========================================================
    // ✅ SAFE PRICING CALCULATION (ADDED — NO LOGIC REMOVED)
    // ==========================================================
    let pricingBreakup = undefined;
    let totals = undefined;

    if (pricePerDay && checkInDate && checkOutDate) {
      const price = Number(pricePerDay);

      const nights = Math.ceil(
        (new Date(checkOutDate) - new Date(checkInDate)) /
        (1000 * 60 * 60 * 24)
      );

      const fakePricePerDay = price + (price * 0.20);
      const userPricePerDay = price - (price * 0.10);
      const websiteCommissionPerDay = price * 0.10;
      const hostPricePerDay = price - (price * 0.20);

      pricingBreakup = {
        fakePricePerDay,
        userPricePerDay,
        websiteCommissionPerDay,
        hostPricePerDay
      };

      totals = {
        nights,
        totalCommission: Math.round(websiteCommissionPerDay * nights),
        totalHostEarning: Math.round(hostPricePerDay * nights)
      };
    }

    // ==========================================================
    // ✅ EXISTING LOGIC (UNCHANGED)
    // ==========================================================
    const newBooking = new BookingRoom({
      ...req.body,
      pricingBreakup,
      totals,
      bookingStatus: "pending"
    });

    const savedBooking = await newBooking.save();

    res.status(201).json({
      success: true,
      message: "Booking created",
      booking: savedBooking,
    });

  } catch (err) {
    console.error("Error creating booking:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});


// ========================================================================
// 📌 Get All Bookings (Admin)
// ========================================================================
router.get("/all", async (req, res) => {
  try {
    const bookings = await BookingRoom.find()
      .populate("userId", "name email")
      .populate("hostId", "name email")
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });

  } catch (error) {
    console.error("Fetch Booking Error:", error);
    res.status(500).json({ success: false, message: "Failed to load bookings" });
  }
});


// ========================================================================
// 📌 Get Single Booking By ID
// ========================================================================
router.get("/:id", async (req, res) => {
  try {
    const booking = await BookingRoom.findById(req.params.id)
      .populate("userId", "name email")
      .populate("hostId", "name email");

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    res.json({ success: true, booking });

  } catch (error) {
    console.error("❌ Fetch Booking Error:", error);
    res.status(500).json({ success: false, message: "Failed to load booking" });
  }
});


// ========================================================================
// 🟢 Update booking status + SAFE COMMISSION LOGIC
// ========================================================================
router.put("/:id/status", async (req, res) => {
  try {
    const { status, payment_id } = req.body;

    const booking = await BookingRoom.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    booking.bookingStatus = status || booking.bookingStatus;
    if (payment_id) booking.paymentId = payment_id;

    await booking.save();

    if (status === "paid") {
      const totalAmount = booking.totalAmount || 0;

      const commissionAmount =
        booking.totals?.totalCommission ??
        Math.round(totalAmount * 0.10);

      const hostEarning =
        booking.totals?.totalHostEarning ??
        Math.round(totalAmount * 0.90);

      await new Transaction({
        booking_id: booking._id,
        user_id: booking.userId,
        amount: totalAmount,
        type: "debit",
        remarks: "Customer payment for DogStay booking",
      }).save();

      await new Transaction({
        booking_id: booking._id,
        user_id: booking.hostId,
        amount: hostEarning,
        type: "credit",
        remarks: "Host earning after platform commission",
      }).save();

      await new Transaction({
        booking_id: booking._id,
        user_id: null,
        amount: commissionAmount,
        type: "commission",
        remarks: "Platform commission fee",
      }).save();
    }

    res.json({
      success: true,
      message: "Booking updated",
      booking
    });

  } catch (err) {
    console.error("Error updating booking status:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


// ========================================================================
// 🗑 Delete booking
// ========================================================================
router.delete("/delete/:id", async (req, res) => {
  try {
    const booking = await BookingRoom.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    await BookingRoom.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Booking deleted successfully" });

  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
