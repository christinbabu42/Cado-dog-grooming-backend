const express = require("express");
const GroomerBooking = require("../models/GroomerBooking");
const router = express.Router();
const mongoose = require("mongoose");

// GET all groomer bookings (for admin)
router.get("/all-bookings", async (req, res) => {
  try {
    const bookings = await GroomerBooking.find().sort({ date: -1 });
    res.json({ success: true, bookings });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET SINGLE GROOMER BOOKING BY ID
router.get("/groomer-booking-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID" });
    }

    const booking = await GroomerBooking.findById(id);

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================
// UPDATE PAYMENT STATUS (paid / pending)
// ==========================================
router.put("/update-payment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid booking ID" });
    }

    // ✅ Validate paymentStatus
    if (!["paid", "pending"].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "paymentStatus must be 'paid' or 'pending'" });
    }

    // ✅ Update booking
    const updatedBooking = await GroomerBooking.findByIdAndUpdate(
      id,
      { paymentStatus },
      { new: true } // return the updated document
    );

    if (!updatedBooking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    res.json({ success: true, booking: updatedBooking });
  } catch (err) {
    console.error("Error updating payment status:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
