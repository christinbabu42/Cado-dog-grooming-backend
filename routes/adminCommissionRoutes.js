const express = require("express");
const router = express.Router();
const BookingRoom = require("../models/BookingRoom");

// -------------------------------------------
// GET: All Commission Details (Admin)
// -------------------------------------------
router.get("/commissions", async (req, res) => {
  try {
    const bookings = await BookingRoom.find({})
      .populate("userId")
      .populate("hostId")
      .sort({ createdAt: -1 });

    let summary = {
      totalCommission: 0,
      paidCommission: 0,
      unpaidCommission: 0,
      totalBookings: bookings.length
    };

    const commissionList = bookings.map(b => {
      const commission =
        b.totals?.totalCommission ??
        Math.round((b.totalAmount || 0) * 0.10);

      // ✅ FIX: Online bookings are ALWAYS paid
      const isCommissionPaid =
        b.paymentMethod !== "Cash" || b.commissionPaid === true;

      summary.totalCommission += commission;

      if (isCommissionPaid) {
        summary.paidCommission += commission;
      } else {
        summary.unpaidCommission += commission;
      }

      return {
        bookingId: b._id,
        roomName: b.roomName,
        roomId: b.listingId,
        user: b.fullName,
        host: b.hostId || null,
        nights: b.totals?.nights || 0,
        totalCommission: commission,
        commissionPaid: isCommissionPaid, // ✅ FIXED
        bookingStatus: b.bookingStatus,
        createdAt: b.createdAt
      };
    });

    res.json({
      success: true,
      summary,
      commissions: commissionList
    });

  } catch (err) {
    console.error("Commission Fetch Error:", err);
    res.status(500).json({ success: false });
  }
});


module.exports = router;
