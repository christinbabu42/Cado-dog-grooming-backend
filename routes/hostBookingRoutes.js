const express = require("express");
const router = express.Router();
const BookingRoom = require("../models/BookingRoom");

// Get all bookings for a specific host
router.get("/host/:hostId", async (req, res) => {
  try {
    const { hostId } = req.params;

    const bookings = await BookingRoom.find({ hostId })
      .populate("userId", "name email")
      .populate("listingId", "roomName")
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (err) {
    console.error("Host Booking Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
