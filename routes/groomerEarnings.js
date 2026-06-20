const express = require("express");
const GroomerBooking = require("../models/GroomerBooking");
const User = require("../models/User");
const auth = require("../middlewares/auth");
const GroomingStaff = require("../models/GroomingStaff");


const router = express.Router();

/* =================================================
   GET GROOMER EARNINGS (FOR GROOMER DASHBOARD)
================================================= */
router.get("/earnings", auth, async (req, res) => {
  try {
    // only groomer
    if (req.user.role !== "grstaff") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const staffId = req.user.mongoId;

    const bookings = await GroomerBooking.find({
      staffId: staffId.toString(),
      paymentStatus: "paid",
    });

    const totalBookings = bookings.length;
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.finalAmount || 0), 0);
    const totalCommission = bookings.reduce((sum, b) => sum + (b.commissionAmount || 0), 0);
    const totalEarning = bookings.reduce((sum, b) => sum + (b.staffEarning || 0), 0);

    const user = await User.findById(staffId).select("name bankDetails");

    res.json({
      success: true,
      groomerName: user?.name || "Groomer",
      bankDetails: user?.bankDetails || null,
      totalBookings,
      totalRevenue,
      totalCommission,
      totalEarning,
    });

  } catch (err) {
    console.error("Earnings error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* =================================================
   GET ALL GROOMERS EARNINGS (FOR GRADMIN)
================================================= */
router.get("/admin/all", auth, async (req, res) => {
  try {
    if (req.user.role !== "gradmin") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    // ✅ Fetch from GroomingStaff collection
    const groomers = await GroomingStaff.find({ isApproved: true });

    const results = [];

    for (const groomer of groomers) {
const bookings = await GroomerBooking.find({
  staffId: groomer._id.toString(),
  paymentStatus: "paid",
  payoutStatus: "pending"  // only count bookings not yet paid out
});



      const totalBookings = bookings.length;
      const totalRevenue = bookings.reduce((s, b) => s + (b.finalAmount || 0), 0);
      const totalCommission = bookings.reduce((s, b) => s + (b.commissionAmount || 0), 0);
      const totalEarning = bookings.reduce((s, b) => s + (b.staffEarning || 0), 0);

      results.push({
        staffId: groomer._id,
        groomerName: groomer.fullName,
        email: groomer.email,
        phone: groomer.phone,
        bankDetails: groomer.bankDetails || null,
        totalBookings,
        totalRevenue,
        totalCommission,
        totalEarning
      });
    }

    res.json({
      success: true,
      groomers: results
    });

  } catch (err) {
    console.error("Admin earnings error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


module.exports = router;
