```js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const BookingRoom = require("../models/BookingRoom");
const auth = require("../middlewares/auth");

// Get all bookings for a specific host
router.get("/host/:hostId", auth, async (req, res) => {
  try {
    const { hostId } = req.params;

    if (!hostId || hostId === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Host ID missing"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Host ID"
      });
    }

    const hostObjectId = new mongoose.Types.ObjectId(hostId);

    const bookings = await BookingRoom.find({
      hostId: hostObjectId
    })
      .populate("userId", "name email")
      .populate("listingId", "roomName")
      .sort({ createdAt: -1 });

    console.log("🏠 Host ID:", hostId);
    console.log("📦 Bookings found:", bookings.length);

    res.json({
      success: true,
      bookings
    });

  } catch (err) {
    console.error("Host Booking Error:", err);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;
```
