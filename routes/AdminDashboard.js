const express = require("express");
const router = express.Router();

const User = require("../models/User");
const BookingRoom = require("../models/BookingRoom");
const GroomerBooking = require("../models/GroomerBooking");
const Listing = require("../models/Listing");
const DogStay = require("../models/DogStay");

// ====================================================================
// 🟢 ADMIN DASHBOARD STATS 
// ====================================================================
router.get("/", async (req, res) => {
  try {
    // 📅 Month range
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date();
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    endOfMonth.setDate(0);
    endOfMonth.setHours(23, 59, 59, 999);

    // 👥 Total Users
    const activeUsers = await User.countDocuments();

    // 🏠 Total Listings
    const totalListings = await DogStay.countDocuments();

    // 📆 Bookings Today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const bookingsToday = await BookingRoom.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    // 💰 TOTAL COMMISSION (PAID + UNPAID) — THIS MONTH
    const commissionResult = await BookingRoom.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          "totals.totalCommission": { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: "$totals.totalCommission" }
        }
      }
    ]);

    const revenueMonth =
      commissionResult.length > 0 ? commissionResult[0].totalCommission : 0;

    // ⭐ Avg Rating (optional – safe fallback)
    const avgRating = 0; // hook later if needed

    // 🆕 New Hosts Today
    const listingtoday = await DogStay.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    res.status(200).json({
      activeUsers,
      totalListings,
      bookingsToday,
      revenueMonth,
      avgRating,
      listingtoday
    });

  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard stats",
      error: err.message
    });
  }
});

module.exports = router;
