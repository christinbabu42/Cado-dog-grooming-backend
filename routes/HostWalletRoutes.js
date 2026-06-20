// routes/hostWalletRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const BookingRoom = require("../models/BookingRoom");

// ===============================
// 🧾 HOST WALLET SUMMARY (MONTHLY)
// ===============================
router.get("/summary/:hostId", async (req, res) => {
  try {
    const { hostId } = req.params;

    // ✅ Validate hostId
    if (!mongoose.Types.ObjectId.isValid(hostId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hostId"
      });
    }

    const hostObjectId = new mongoose.Types.ObjectId(hostId);

    const stats = await BookingRoom.aggregate([
      {
        $match: {
          hostId: hostObjectId,
          bookingStatus: { $ne: "cancelled" }
        }
      },
      {
        $addFields: {
          month: {
            $dateToString: {
              format: "%B %Y",
              date: "$checkInDate"
            }
          }
        }
      },
      {
        $group: {
          _id: "$month",
          totalBookings: { $sum: 1 },
          totalBookingAmount: { $sum: "$totalAmount" },
          totalProfit: {
            $sum: "$totals.totalHostEarning"
          }
        }
      },
      {
        $sort: { "_id": -1 }
      }
    ]);

    res.json({
      success: true,
      monthlyStats: stats.map(s => ({
        month: s._id,
        totalBookings: s.totalBookings,
        totalBookingAmount: s.totalBookingAmount || 0,
        totalProfit: s.totalProfit || 0
      }))
    });

  } catch (err) {
    console.error("❌ Wallet Summary Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;
