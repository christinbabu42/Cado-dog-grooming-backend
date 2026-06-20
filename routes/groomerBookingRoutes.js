const express = require("express");
const GroomerBooking = require("../models/GroomerBooking");
const calculateDistanceKm = require("../utils/calculateDistance");
const User = require("../models/User");
const Razorpay = require("razorpay");
const crypto = require("crypto");
// ⭐ ADD THIS LINE
const auth = require("../middlewares/auth"); // Adjust the path as needed
const BookingRoom = require("../models/BookingRoom"); // ✅ Add this at the top
const GroomingStaff = require("../models/GroomingStaff");



const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});



// =========================================================
// 1️⃣ CREATE ORDER FOR ONLINE PAYMENT
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
// 2️⃣ VERIFY PAYMENT + SAVE BOOKING
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

    // 🔥 NEW — COMMISSION CALCULATION (ADD THIS)
    const commissionPercent = 20;
    const commissionAmount = Math.round(
      (form.finalAmount * commissionPercent) / 100
    );
    const staffEarning = form.finalAmount - commissionAmount;
    // 🔥 END NEW

    const booking = new GroomerBooking({
      ...form,
      userLocation: { lat: form.lat, lng: form.lng },
      staffId: form.staffId,
      staffName: form.staffName,
      staffLocation: form.staffLocation,
      paymentMethod: "Online",
      paymentStatus: "paid",
      paymentId: razorpay_payment_id,

      // 🔥 NEW FIELDS SAVED
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
// 3️⃣ CASH PAYMENT (NO RAZORPAY)
// =========================================================
router.post("/cash-payment", async (req, res) => {
  try {
    const {
      distanceKm,
      travelCharge,
      finalAmount,
      ...form
    } = req.body;

    // 🔥 NEW — COMMISSION CALCULATION (ADD THIS)
    const commissionPercent = 20;
    const commissionAmount = Math.round(
      (finalAmount * commissionPercent) / 100
    );
    const staffEarning = finalAmount - commissionAmount;
    // 🔥 END NEW

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

      // 🔥 NEW FIELDS SAVED
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
// GET ALL GROOMER BOOKINGS (for admin)
router.get("/all-bookings", async (req, res) => {
  try {
    const bookings = await GroomerBooking.find()
      .sort({ createdAt: -1 }); // ✅ only sort by existing field
    res.json({ success: true, bookings });
  } catch (err) {
    console.error("Error fetching bookings:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// .............................
// // GET SINGLE BOOKING DETAILS
// .............................

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

// ..................................
// // DELETE a groomer booking by ID
// ..................................

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

// // // .....................
// // staff earnings for staff only
// .............................
// GET staff earnings (with optional recent bookings)
// GET staff earnings (WITH DATE RANGE FILTER)
router.get("/staff/earnings/:staffId", auth, async (req, res) => {
  try {
    const { staffId } = req.params;
    const { range } = req.query;

    // ⏱ DATE FILTER
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
    res.status(500).json({ success: false });
  }
});





// ..................................
// // UPDATE GROOMING STATUS
// .................................

router.put("/update-status/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const booking = await GroomerBooking.findByIdAndUpdate(
      req.params.id,
      { groomingStatus: status },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    res.json({ success: true, booking });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ success: false });
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

// =========================================================
router.post("/calculate-travel", auth, async (req, res) => {
  try {
    const { staffID, servicePrice, userLat, userLng } = req.body;

    if (!staffID) {
      return res.status(400).json({ message: "staffID missing" });
    }

    const user = await User.findById(req.user.mongoId);
    const staffDoc = await GroomingStaff.findOne({ staffID });

    if (!staffDoc) {
      return res.status(404).json({ message: "Groomer record not found" });
    }

    const uLat = userLat ?? user?.location?.lat;
    const uLng = userLng ?? user?.location?.lng;

    const sLat = staffDoc.location?.lat;
    const sLng = staffDoc.location?.lng;

    if (!uLat || !uLng) {
      return res.status(400).json({ message: "User location missing" });
    }

    if (!sLat || !sLng) {
      return res.status(400).json({ message: "Groomer location missing" });
    }

    const distanceKm = calculateDistanceKm(uLat, uLng, sLat, sLng);

    // 🧮 Business rule
    const travelCharge = distanceKm > 2 ? Math.ceil(distanceKm - 2) * 8 : 0;
    const finalAmount = Number(servicePrice) + travelCharge;

    res.json({
      success: true,
      distanceKm: Number(distanceKm.toFixed(2)),
      travelCharge,
      finalAmount
    });

  } catch (err) {
    console.error("Travel calculation error:", err);
    res.status(500).json({ message: "Travel calculation failed" });
  }
});







module.exports = router;
